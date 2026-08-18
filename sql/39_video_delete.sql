-- 39_video_delete.sql — Video silme / yayından kaldırma backend mimarisi (RBAC + soft delete +
-- saklama-süreli storage temizliği + denetim). 18_roles.sql'den SONRA çalıştır.
--
-- YETKİ MODELİ (RBAC):
--   • Owner (içerik üreticisi): yalnız videos.creator_id = auth.uid() olan KENDİ videosunu siler.
--   • Moderator/Admin (is_moderator): TÜM videoları siler; başkasının içeriğini silerken GEREKÇE zorunlu.
-- SİLME STRATEJİSİ:
--   • DB: SOFT DELETE (is_deleted=true, deleted_at, deleted_by, delete_reason). Silinen içerik
--     genel liste/akış/aramadan RLS ile OTOMATİK süzülür (aşağıda politikalar güncellenir).
--   • STORAGE (Cloudflare Stream): ANINDA DEĞİL. Kurtarma/denetim/kaza-koruması için 30 GÜN saklanır;
--     purge_after zamanı gelince ZAMANLANMIŞ 'purge-videos' Edge Function CF Stream assetini (video +
--     thumbnail + HLS/DASH — hepsi cf_uid altında) kalıcı siler, purged_at damgalar. Moderatör yasa dışı
--     içerik için p_hemen=true ile saklamayı atlar (purge_after=now → sonraki cron turunda temizlenir).
-- DENETİM: mevcut audit_log yeniden kullanılır (eylem 'videos_deleted' / 'videos_restored';
--   detay = {reason, owner_id, moderasyon, onceki_durum, purge_after}).

-- ————— Soft delete + saklama alanları —————
alter table public.videos
  add column if not exists is_deleted   boolean not null default false,
  add column if not exists deleted_at    timestamptz,
  add column if not exists deleted_by    uuid references public.profiles(id) on delete set null,
  add column if not exists delete_reason text,
  add column if not exists purge_after   timestamptz,   -- storage temizliğine uygunluk (soft delete + 30 gün)
  add column if not exists purged_at     timestamptz;   -- CF Stream asseti gerçekten silindiğinde damgalanır

-- Purge worker'ının hızlı bulması için kısmi indeks (yalnız temizlenmeyi bekleyenler)
create index if not exists videos_purge_idx on public.videos (purge_after)
  where is_deleted = true and purged_at is null;

-- ————— RLS: silinen videolar TÜM okuma/akış/aramadan SÜZÜLÜR (anon + üretici + moderatör) —————
-- Public: yalnız onaylı VE silinmemiş. Üretici: kendininki VE silinmemiş (kaldırılan Studio'da görünmez).
-- Moderatör de normal SELECT'te silinenleri GÖRMEZ (akışa sızmasın); silinenlere erişim YALNIZ definer
-- RPC'lerle: silinen_videolar (liste) + video_geri_al (kurtarma) + video_sil (idempotent).
drop policy if exists "video: onayli herkese acik" on public.videos;
create policy "video: onayli herkese acik" on public.videos
  for select using (status = 'approved' and is_deleted = false);

drop policy if exists "video: uretici kendininkini gorur" on public.videos;
create policy "video: uretici kendininkini gorur" on public.videos
  for select using (creator_id = auth.uid() and is_deleted = false);

-- 18_roles.sql'deki moderatör okuma politikasını is_deleted süzgeciyle sıkılaştır (inceleme kuyruğu
-- silinenleri içermez; onlar silinen_videolar RPC'sinde). UPDATE (onayla/reddet) politikası değişmez.
drop policy if exists "video: moderator okur" on public.videos;
create policy "video: moderator okur" on public.videos
  for select using (public.is_moderator() and is_deleted = false);

-- ————— DELETE /api/v1/videos/{id} çekirdeği: video_sil (SECURITY DEFINER) —————
-- Tek yetki kaynağı: owner VEYA is_moderator. RLS'i denetimli aşar; SQLSTATE ile HTTP eşlenir
-- (video-delete Edge Function): P0002→404, 42501→403, 22004(gerekçe yok)→400.
create or replace function public.video_sil(
  p_video  uuid,
  p_reason text default null,
  p_hemen  boolean default false   -- yalnız moderatör: saklamayı atla (yasa dışı içerik takedown)
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v         record;
  v_owner   boolean;
  v_mod     boolean;
  v_gerekce text := nullif(btrim(coalesce(p_reason, '')), '');
  v_purge   timestamptz;
begin
  select id, creator_id, cf_uid, status, is_deleted into v
    from public.videos where id = p_video;

  -- 404
  if not found then
    raise exception 'video bulunamadi' using errcode = 'P0002';
  end if;

  v_owner := v.creator_id is not null and v.creator_id = auth.uid();
  v_mod   := public.is_moderator();

  -- 403 — ne sahibi ne yetkili
  if not (v_owner or v_mod) then
    raise exception 'yetkisiz silme' using errcode = '42501';
  end if;

  -- İdempotent: zaten silinmişse tekrar audit yazma
  if v.is_deleted then
    return jsonb_build_object('ok', true, 'video_id', v.id, 'zaten_silinmis', true);
  end if;

  -- Moderasyon kaldırması (sahibi DEĞİL) → gerekçe ZORUNLU (400)
  if v_mod and not v_owner and v_gerekce is null then
    raise exception 'moderasyon silmesinde gerekce zorunlu' using errcode = '22004';
  end if;

  -- Saklama: varsayılan 30 gün; moderatör p_hemen ile atlayabilir (owner atlayamaz — kaza koruması)
  v_purge := case when p_hemen and v_mod then now() else now() + interval '30 days' end;

  update public.videos
     set is_deleted    = true,
         deleted_at    = now(),
         deleted_by    = auth.uid(),
         delete_reason = v_gerekce,
         purge_after   = v_purge
   where id = p_video;

  -- Denetim (mevcut audit_log). NOT: status DEĞİŞMEDİĞİ için videos_denetim tetikleyicisi tetiklenmez.
  insert into public.audit_log (actor, tablo, kayit, eylem, detay)
  values (
    auth.uid(), 'videos', v.id, 'videos_deleted',
    jsonb_build_object(
      'reason',       v_gerekce,
      'owner_id',     v.creator_id,
      'moderasyon',   (v_mod and not v_owner),
      'onceki_durum', v.status,
      'purge_after',  v_purge
    )
  );

  return jsonb_build_object('ok', true, 'video_id', v.id, 'purge_after', v_purge);
end;
$$;
revoke execute on function public.video_sil(uuid, text, boolean) from public, anon;
grant execute on function public.video_sil(uuid, text, boolean) to authenticated;

-- ————— Geri alma (saklama süresi içinde) — owner VEYA moderator; storage silinmemişse —————
create or replace function public.video_geri_al(p_video uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v       record;
  v_owner boolean;
begin
  select id, creator_id, is_deleted, purged_at into v
    from public.videos where id = p_video;
  if not found then
    raise exception 'video bulunamadi' using errcode = 'P0002';
  end if;

  v_owner := v.creator_id is not null and v.creator_id = auth.uid();
  if not (v_owner or public.is_moderator()) then
    raise exception 'yetkisiz' using errcode = '42501';
  end if;
  -- Storage kalıcı silinmişse geri alınamaz
  if v.purged_at is not null then
    raise exception 'kalici temizlenmis, geri alinamaz' using errcode = '22023';
  end if;
  if not v.is_deleted then
    return jsonb_build_object('ok', true, 'video_id', v.id, 'zaten_aktif', true);
  end if;

  update public.videos
     set is_deleted = false, deleted_at = null, deleted_by = null,
         delete_reason = null, purge_after = null
   where id = p_video;

  insert into public.audit_log (actor, tablo, kayit, eylem, detay)
  values (auth.uid(), 'videos', v.id, 'videos_restored',
          jsonb_build_object('owner_id', v.creator_id));

  return jsonb_build_object('ok', true, 'video_id', v.id);
end;
$$;
revoke execute on function public.video_geri_al(uuid) from public, anon;
grant execute on function public.video_geri_al(uuid) to authenticated;

-- ————— Yetkili: soft-deleted video kuyruğu (moderasyon paneli / denetim görünümü) —————
-- Silinmiş videoları (kim/ne zaman/neden/storage durumu) yalnız moderatör/admin listeler.
create or replace function public.silinen_videolar(p_limit int default 100)
returns table (
  video_id uuid, title_id uuid, title_ad text, video_ad text,
  owner_id uuid, owner_ad text, deleted_by uuid, silen_ad text,
  reason text, deleted_at timestamptz, purge_after timestamptz, purged_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.title_id, ti.name, v.name,
         v.creator_id, po.display_name, v.deleted_by, ps.display_name,
         v.delete_reason, v.deleted_at, v.purge_after, v.purged_at
  from public.videos v
  left join public.titles   ti on ti.id = v.title_id
  left join public.profiles po on po.id = v.creator_id
  left join public.profiles ps on ps.id = v.deleted_by
  where public.is_moderator() and v.is_deleted = true
  order by v.deleted_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;
revoke execute on function public.silinen_videolar(int) from public, anon;
grant execute on function public.silinen_videolar(int) to authenticated;
