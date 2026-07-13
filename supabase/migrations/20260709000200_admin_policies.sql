-- Bu dosya sql/02_admin_policies.sql dosyasından üretildi — ELLE DÜZENLEME, sql/ altını değiştirip
-- `npm run db:sync` çalıştır.

-- 02_admin_policies.sql — Adminlere inceleme/yayın erişimi
-- 01_schema.sql'den SONRA çalıştır. Admin atamak için (SQL Editor'den, service role ile):
--   update public.profiles set role = 'admin' where id = '<kullanici-uuid>';

-- RLS içinde güvenli admin kontrolü (security definer: profiles RLS'ine takılmaz)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Başlıklar: admin her şeyi görür, yayınlar/geri çeker
create policy "baslik: admin okur" on public.titles
  for select using (public.is_admin());
create policy "baslik: admin gunceller" on public.titles
  for update using (public.is_admin()) with check (public.is_admin());

-- Videolar: admin inceleme kuyruğunu görür, onaylar/reddeder
create policy "video: admin okur" on public.videos
  for select using (public.is_admin());
create policy "video: admin gunceller" on public.videos
  for update using (public.is_admin()) with check (public.is_admin());

-- İzlenme olayları: admin toplu okuyabilir (analiz fonksiyonları da security definer)
create policy "izlenme: admin okur" on public.watch_events
  for select using (public.is_admin());

-- Profiller: admin listeyi görebilir (moderasyonda üretici adı göstermek için)
create policy "profil: admin okur" on public.profiles
  for select using (public.is_admin());
