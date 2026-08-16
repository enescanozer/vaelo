-- M2: "Yeni Bölüm Cuması" — haftalık bölüm ritmi.
-- titles.haftalik: üretici bir diziyi "her hafta yeni bölüm" olarak işaretler. Rozet + "Bu
-- Hafta Yeni" rafında öne çıkarma için. Bildirim tarafı AYRICA yeni tablo GEREKTİRMEZ:
-- 06_notifications.sql'deki tetikleyici zaten Listem'de (my_list) başlığı olan herkese yeni
-- bölüm onaylanınca bildirim düşürüyor → "takip et = Listem'e ekle" akışı hazır.
alter table public.titles
  add column if not exists haftalik boolean not null default false;

comment on column public.titles.haftalik is
  'Haftalık dizi (Yeni Bölüm Cuması ritmi) — rozet + Bu Hafta Yeni vurgusu';
