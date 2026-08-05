-- 18_roles.sql — Çoklu yetki: 'moderator' rolü (içerik moderasyonu, gelir/analiz DEĞİL)
-- 17_art_moderation.sql'den SONRA çalıştır.
--
-- Roller: viewer < creator < moderator < admin (yetki bakımından).
--   moderator = video/başlık inceleme (onayla/reddet/yayınla) + Tablo eser kaldırma/rapor.
--   admin     = HER ŞEY + gelir/analiz/yarışma/denetim + rol atama (moderator/creator/viewer).
-- is_admin() dokunulmaz (yalnız 'admin'); is_moderator() = admin VEYA moderator.

-- ————— Rol kısıtına 'moderator' ekle —————
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('viewer', 'creator', 'admin', 'moderator'));

-- ————— is_moderator(): içerik moderasyonu yetkisi (admin bunu da kapsar) —————
create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'moderator')
  );
$$;

-- ————— Rol atama: admin, BAŞKA kullanıcıyı viewer/creator/moderator arasında taşır —————
-- 'admin'e yükseltme ya da mevcut admini düşürme YALNIZ service_role (SQL Editor) ile.
create or replace function public.rol_degisimini_engelle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    -- Doğrudan/servis bağlantısı (SQL Editor, service_role, göç): uygulama kullanıcısı YOK
    -- → serbest (ilk admini de böyle atarsın). NOT: SQL Editor'da auth.role() 'service_role'
    -- DEĞİL ve auth.uid() NULL'dur; bu yüzden asıl ayırt edici uid'nin null olmasıdır.
    if auth.uid() is null or auth.role() = 'service_role' then
      return new;
    end if;
    -- Admin başka kullanıcının rolünü moderator/creator/viewer yapabilir;
    -- kendi satırına, 'admin'e ya da mevcut bir adminin rolüne DOKUNAMAZ.
    if public.is_admin()
       and new.id <> auth.uid()
       and old.role <> 'admin'
       and new.role in ('viewer', 'creator', 'moderator') then
      return new;
    end if;
    raise exception 'rol yalnizca yetkili tarafindan degistirilebilir';
  end if;
  return new;
end;
$$;

-- Admin, rol atamak için başka profilleri güncelleyebilir (rol koruması trigger'da)
drop policy if exists "profil: admin gunceller" on public.profiles;
create policy "profil: admin gunceller" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- ————— İçerik moderasyonu ilkelerini is_admin → is_moderator'a çevir —————
-- (02_admin_policies.sql'de is_admin ile açılmıştı; moderatör de erişsin.)
drop policy if exists "baslik: admin okur" on public.titles;
create policy "baslik: moderator okur" on public.titles
  for select using (public.is_moderator());
drop policy if exists "baslik: admin gunceller" on public.titles;
create policy "baslik: moderator gunceller" on public.titles
  for update using (public.is_moderator()) with check (public.is_moderator());

drop policy if exists "video: admin okur" on public.videos;
create policy "video: moderator okur" on public.videos
  for select using (public.is_moderator());
drop policy if exists "video: admin gunceller" on public.videos;
create policy "video: moderator gunceller" on public.videos
  for update using (public.is_moderator()) with check (public.is_moderator());

-- Moderasyonda üretici adını göstermek için profil okuma
drop policy if exists "profil: admin okur" on public.profiles;
create policy "profil: moderator okur" on public.profiles
  for select using (public.is_moderator());

-- Tablo eser bildirimlerini moderatör de okur
drop policy if exists "rapor: admin okur" on public.art_reports;
create policy "rapor: moderator okur" on public.art_reports
  for select using (public.is_moderator());

-- Tablo eser kaldırma: moderatör de yapabilir
create or replace function public.art_kaldir(p_piece uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then raise exception 'yalniz moderator/admin'; end if;
  update public.art_pieces set durum = 'kaldirildi' where id = p_piece;
end;
$$;

grant execute on function public.is_moderator() to authenticated;
grant execute on function public.art_kaldir(uuid) to authenticated;

-- NOT: watch_events okuma, sponsors, contests, app_settings, audit_log, analiz fonksiyonları
-- ve Tablo hafta yaşam döngüsü (art_sonraki_tur/art_sergiye_al/art_lifecycle_ilerlet)
-- BİLEREK is_admin ile kalır — bunlar yalnız admin (owner) yetkisidir.
