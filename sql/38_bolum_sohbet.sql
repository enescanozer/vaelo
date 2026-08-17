-- 38_bolum_sohbet.sql — Bölüm/başlık CANLI SOHBETİ (forum thread modeli yerine düz sohbet akışı).
-- Twitch-tarzı: konu başlığı YOK, tek sürekli akış, gerçek zamanlı (Supabase Realtime).
--
-- Oda anahtarı (oda): 'ep:<video_id>' (bölüm sohbeti) | 'title:<title_id>' (film/dizi geneli).
--   → videos/titles'a FK YOK (esnek; Video/Cloudflare şemasına dokunulmaz).
-- YAZMA yalnız forum-post Edge Function 'sohbet' action'ından (moderasyon FAIL-CLOSED + mute/ban
--   + oda kilidi backend'de zorunlu). RLS'te CLIENT INSERT/UPDATE İLKESİ YOK.
-- OKUMA herkese açık (görünür + silinmemiş) — Realtime postgres_changes bu RLS'i uygular.
-- nickname SATIRA DENORMALİZE edilir → realtime payload'ında hazır gelir (profiles self-only
--   RLS'ini realtime'da aşma derdi olmaz; üretici rozetiyle AYNI display_name gösterilir).

-- ————— Sohbet mesajı (düz akış) —————
create table if not exists public.sohbet_mesajlari (
  id uuid primary key default gen_random_uuid(),
  oda text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  nickname text not null,
  mesaj text not null check (char_length(mesaj) between 1 and 5000),
  is_spoiler boolean not null default false,
  status text not null default 'visible' check (status in ('visible', 'removed')),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sohbet_mesajlari_oda_idx
  on public.sohbet_mesajlari (oda, created_at);

-- ————— Oda kilidi (moderasyon durumu) — kilitliyken edge function yeni mesajı reddeder —————
create table if not exists public.sohbet_odalari (
  oda text primary key,
  locked boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ————— RLS —————
alter table public.sohbet_mesajlari enable row level security;
alter table public.sohbet_odalari enable row level security;

-- Mesaj: görünür + silinmemiş herkese açık okuma; yazma YOK (yalnız edge fn service role / RPC).
create policy "sohbet_mesaj: gorunur herkese acik" on public.sohbet_mesajlari
  for select using (status = 'visible' and deleted_at is null);
-- Sahibi kendi (silinmiş de olsa) satırını görebilir (opsiyonel; tutarlılık için).
create policy "sohbet_mesaj: sahibi gorur" on public.sohbet_mesajlari
  for select using (user_id = auth.uid());
-- Yetkili hepsini görür (moderasyon).
create policy "sohbet_mesaj: yetkili gorur" on public.sohbet_mesajlari
  for select using (public.is_moderator());

-- Oda durumu: herkes okur (composer kilit bilgisini gösterir); yazma yalnız RPC (is_moderator).
create policy "sohbet_oda: herkes okur" on public.sohbet_odalari
  for select using (true);

-- Grant (bulut varsayılanı yeni tabloyu otomatik açmayabilir → açık ver; RLS güvenliği korur)
grant select on public.sohbet_mesajlari to anon, authenticated;
grant select on public.sohbet_odalari to anon, authenticated;

-- ————— Realtime yayını (postgres_changes ile canlı mesaj) —————
do $$
begin
  alter publication supabase_realtime add table public.sohbet_mesajlari;
exception
  when duplicate_object then null;  -- zaten üye
end $$;
-- UPDATE/DELETE'te eski değerler de gelsin (kaldırma olaylarını canlı işleyebilmek için).
alter table public.sohbet_mesajlari replica identity full;

-- ————— Eylem RPC'leri (SECURITY DEFINER) —————
-- Kendi mesajını sil (soft): içerik değişmez; deleted_at + status='removed'.
create or replace function public.sohbet_mesaj_sil(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.sohbet_mesajlari
    set deleted_at = now(), status = 'removed'
    where id = p_id and user_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'yetki yok veya mesaj yok'; end if;
end; $$;
revoke execute on function public.sohbet_mesaj_sil(uuid) from public, anon;
grant execute on function public.sohbet_mesaj_sil(uuid) to authenticated;

-- Yetkili mesaj kaldırma (is_moderator).
create or replace function public.sohbet_mesaj_kaldir(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'yalniz yetkili'; end if;
  update public.sohbet_mesajlari set status = 'removed' where id = p_id;
end; $$;
revoke execute on function public.sohbet_mesaj_kaldir(uuid) from public, anon;
grant execute on function public.sohbet_mesaj_kaldir(uuid) to authenticated;

-- Oda kilidini aç/kapa (is_moderator): tüm oda için tek kilit durumu (thread filtresi DEĞİL).
create or replace function public.sohbet_oda_kilit(p_oda text, p_locked boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'yalniz yetkili'; end if;
  insert into public.sohbet_odalari (oda, locked, updated_at)
    values (p_oda, p_locked, now())
    on conflict (oda) do update set locked = excluded.locked, updated_at = now();
end; $$;
revoke execute on function public.sohbet_oda_kilit(text, boolean) from public, anon;
grant execute on function public.sohbet_oda_kilit(text, boolean) to authenticated;
