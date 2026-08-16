-- Bu dosya sql/28_banner_schedule.sql dosyasından üretildi — ELLE DÜZENLEME, sql/ altını değiştirip
-- `npm run db:sync` çalıştır.

-- M4: Zamanlı banner geçişi — promo_banners'a tarih penceresi ekler.
-- Amaç: admin birden çok banner tanımlar; belirlenen tarihte (ör. 5 Kasım) otomatik geçiş
-- yapar. Elle "aç/kapat" gerektirmez — pencere gelince banner kendiliğinden yürürlüğe girer,
-- bitince düşer. Boş starts_at → hemen geçerli; boş ends_at → süresiz.

alter table public.promo_banners
  add column if not exists starts_at timestamptz, -- boş → hemen geçerli
  add column if not exists ends_at timestamptz;    -- boş → süresiz

-- Herkese açık okuma artık tarih penceresini de gözetir (otomatik geçiş RLS düzeyinde de
-- geçerli: pencere dışı banner anon'a hiç görünmez). Admin CRUD policy'si (for all) hepsini görür.
drop policy if exists "promo: aktif herkese acik" on public.promo_banners;
create policy "promo: aktif+pencere herkese acik" on public.promo_banners
  for select using (
    active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );
