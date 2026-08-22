-- 34 — İçerik türleri: kısa film + uzun film (kategori bazlı, süreye göre DEĞİL).
-- titles.kind şimdiye dek yalnız 'film' | 'dizi' idi. Üretici artık üç kategoriden seçer:
-- 'dizi' | 'kisa_film' | 'uzun_film'. Eski 'film' kayıtları geçerli kalır (genel film).
-- 'dizi' mantığı DEĞİŞMEZ (kind = 'dizi'); kısa/uzun film sezon/bölüm taşımaz (film gibi).

alter table public.titles drop constraint if exists titles_kind_check;
alter table public.titles
  add constraint titles_kind_check
  check (kind in ('film', 'dizi', 'kisa_film', 'uzun_film'));
