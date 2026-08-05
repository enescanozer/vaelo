-- 21_creator_apply.sql — Üretici (creator) başvuru + admin onayı
-- 20_push.sql'den SONRA çalıştır.
--
-- Akış: izleyici "Üretici ol" başvurusu açar (beklemede) → admin onaylar → profiles.role='creator'
-- olur → Yükle/Stüdyo açılır. Video yükleme + yayın onayı ayrıca sürer (in_review → approved).
-- Böylece iki kapı: (1) kişi üretici olabilmek için onay alır, (2) her video yayın için onay alır.

create table public.creator_basvurulari (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  durum text not null default 'beklemede'
    check (durum in ('beklemede', 'onaylandi', 'reddedildi')),
  mesaj text,                          -- kullanıcının kısa notu (portföy/neden)
  created_at timestamptz not null default now(),
  karar_at timestamptz
);

alter table public.creator_basvurulari enable row level security;

-- Kullanıcı kendi başvurusunu açar (yalnız 'beklemede') ve kendi durumunu görür.
create policy "basvuru: kendi acar" on public.creator_basvurulari
  for insert to authenticated
  with check (user_id = auth.uid() and durum = 'beklemede');
create policy "basvuru: kendi gorur" on public.creator_basvurulari
  for select using (user_id = auth.uid());
-- Yeniden başvuru: reddedilmişse tekrar deneyebilsin (kendi satırını günceller).
create policy "basvuru: kendi yeniler" on public.creator_basvurulari
  for update to authenticated
  using (user_id = auth.uid() and durum = 'reddedildi')
  with check (user_id = auth.uid() and durum = 'beklemede');

-- Admin tüm başvuruları görür (karar RPC ile).
create policy "basvuru: admin gorur" on public.creator_basvurulari
  for select using (public.is_admin());

-- ————— Admin: başvuruyu onayla (role=creator) / reddet —————
create or replace function public.creator_onayla(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'yalniz admin'; end if;
  update public.creator_basvurulari set durum = 'onaylandi', karar_at = now() where user_id = p_user;
  -- Yalnız izleyiciyi yükselt (mevcut moderator/admin'e dokunma). Rol trigger'ı admin'in
  -- başka kullanıcıyı 'creator' yapmasına izin verir.
  update public.profiles set role = 'creator' where id = p_user and role = 'viewer';
end; $$;

create or replace function public.creator_reddet(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'yalniz admin'; end if;
  update public.creator_basvurulari set durum = 'reddedildi', karar_at = now() where user_id = p_user;
end; $$;

-- ————— Admin: bekleyen başvuruları başvuran adıyla getir —————
create or replace function public.creator_basvuru_listesi()
returns table (user_id uuid, ad text, mesaj text, durum text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.user_id, pr.display_name, b.mesaj, b.durum, b.created_at
  from public.creator_basvurulari b
  left join public.profiles pr on pr.id = b.user_id
  where public.is_admin()
  order by (b.durum = 'beklemede') desc, b.created_at desc;
$$;

grant execute on function public.creator_onayla(uuid) to authenticated;
grant execute on function public.creator_reddet(uuid) to authenticated;
grant execute on function public.creator_basvuru_listesi() to authenticated;

-- ————— Yarışma sekmesi penceresi: aktif VEYA bitişten sonra 14 gün (kazanan/ilk 10) —————
create or replace function public.yarisma_penceresi()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.contests
    where active = true
       or (ends_at is not null and ends_at > now() - interval '14 days')
  );
$$;
grant execute on function public.yarisma_penceresi() to anon, authenticated;

-- ————— Biten yarışma da 14 gün herkese açık (kazanan/ilk 10 gösterimi) —————
drop policy if exists "yarisma: aktif herkese acik" on public.contests;
create policy "yarisma: aktif/yeni bitmis herkese acik" on public.contests
  for select using (
    active = true
    or (ends_at is not null and ends_at > now() - interval '14 days')
  );
