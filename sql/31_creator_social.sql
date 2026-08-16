-- Üretici profili: sosyal medya hesapları + kısa bio (profil bazlı, video başına DEĞİL).
-- Bir üretici bir kere girer; yüklediği tüm videoların detayında görünür.
-- Tüm alanlar opsiyonel (nullable) — boş olan ikon/link gösterilmez.
alter table public.profiles
  add column if not exists bio text,
  add column if not exists instagram text,
  add column if not exists tiktok text,
  add column if not exists youtube text,
  add column if not exists twitter text,
  add column if not exists website text;

-- SORUN: profiles RLS'i self-only okuma (id = auth.uid()) — izleyici bir ÜRETİCİNİN profilini
-- okuyamaz, dolayısıyla video detayında üretici bilgisi gösterilemez. Base tabloyu açmak
-- TÜM profilleri (ve gelecekteki hassas kolonları) ifşa eder; RLS kolon kısıtlayamaz.
-- ÇÖZÜM: yalnız herkese açık (opt-in) kolonları içeren, yalnız üretici/adminleri kapsayan
-- bir GÖRÜNÜM. Base tablo RLS'i self-only kalır. Görünüm owner (postgres) haklarıyla çalışır
-- (security_invoker=false) → anon whitelisted kolonları okur. sanat.js/uretici desenine uygun.
create or replace view public.uretici_kartlari
with (security_invoker = false) as
  select id, display_name, bio, instagram, tiktok, youtube, twitter, website
  from public.profiles
  where role in ('creator', 'admin');

grant select on public.uretici_kartlari to anon, authenticated;
