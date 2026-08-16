-- M3: "Yapım Süreci" (BTS) içerik tipi.
-- Bir video ya ANA içerik (film/bölüm) ya da YAPIM (kamera arkası / yapım süreci) olur.
-- Yapım videoları ana feed'de bölüm olarak GÖRÜNMEZ; yalnız ait olduğu başlığın detayında
-- "Yapım Süreci" bölümünde çapraz bağlanır. Moderasyon/yayın akışı ana videoyla AYNIDIR
-- (in_review → onay → approved); yalnız listeleme ayrışır.
alter table public.videos
  add column if not exists icerik_tipi text not null default 'ana'
    check (icerik_tipi in ('ana', 'yapim'));

comment on column public.videos.icerik_tipi is
  'ana = film/bölüm · yapim = kamera arkası (BTS). yapim ana feed''e girmez, detayda çapraz bağlanır';
