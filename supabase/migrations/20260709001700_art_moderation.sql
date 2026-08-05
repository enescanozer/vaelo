-- Bu dosya sql/17_art_moderation.sql dosyasından üretildi — ELLE DÜZENLEME, sql/ altını değiştirip
-- `npm run db:sync` çalıştır.

-- 17_art_moderation.sql — Tablo (haftalık görsel yarışması) içerik moderasyonu
-- 16_art_cron.sql'den SONRA çalıştır.
--
-- Açık: art_pieces herkese açık 'art' bucket'ından, moderasyonsuz oylamaya/sergiye giriyordu.
-- Bu göç: admin 'kaldirildi' durumuyla eseri çıkarır + izleyici 'report' ile işaretler.
-- Kaldırılan eser oy setinde/sergide GÖRÜNMEZ (fonksiyonlar zaten 'aktif'/'sergide' süzer).

-- ————— 'kaldirildi' durumu —————
alter table public.art_pieces drop constraint if exists art_pieces_durum_check;
alter table public.art_pieces add constraint art_pieces_durum_check
  check (durum in ('aktif', 'elendi', 'sergide', 'kaldirildi'));

-- Admin: eseri kaldır (oylama/sergiden anında çıkar)
create or replace function public.art_kaldir(p_piece uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'yalnız admin'; end if;
  update public.art_pieces set durum = 'kaldirildi' where id = p_piece;
end;
$$;

-- ————— İzleyici bildirimleri (report) —————
create table public.art_reports (
  piece_id uuid not null references public.art_pieces(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  sebep text,
  created_at timestamptz not null default now(),
  primary key (piece_id, reporter_id)   -- kişi başına eser başına tek bildirim
);

alter table public.art_reports enable row level security;
-- Girişli kullanıcı kendi adına bildirir; kendi bildirimini görür; admin hepsini görür.
create policy "rapor: kendi verir" on public.art_reports
  for insert to authenticated with check (reporter_id = auth.uid());
create policy "rapor: kendi okur" on public.art_reports
  for select using (reporter_id = auth.uid());
create policy "rapor: admin okur" on public.art_reports
  for select using (public.is_admin());

grant execute on function public.art_kaldir(uuid) to authenticated;
