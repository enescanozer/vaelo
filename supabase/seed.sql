-- Bu dosya sql/04_seed.sql dosyasından üretildi — ELLE DÜZENLEME (npm run db:sync).
-- Yalnızca yerel geliştirmede (supabase db reset) uygulanır; üretime GİTMEZ.

-- 04_seed.sql — Örnek veri (geliştirme ortamı için, üretime YÜKLEME)
-- 01-03'ten sonra çalıştır. cf_uid'ler sahte olduğundan kapak/oynatma çalışmaz;
-- arayüz düzenini ve analiz panosunu görmek için yeterlidir.

-- Örnek başlıklar (creator_id boş: "Latent Originals" gibi düşün)
insert into public.titles (id, name, description, kind, genre, year, status, published_at) values
  ('00000000-0000-4000-8000-000000000001', 'Sentetik Rüya',
   'Bilinci bir veri merkezine yüklenen bir mimarın, kendi anılarından inşa edilmiş şehirde uyanışı.',
   'film', 'Bilim Kurgu', 2026, 'published', now() - interval '10 days'),
  ('00000000-0000-4000-8000-000000000002', 'Gölge Protokolü',
   'Her bölümü farklı bir modelle üretilen antolojik gerilim: aynı cinayet, yedi farklı anlatıcı.',
   'dizi', 'Gerilim', 2026, 'published', now() - interval '6 days'),
  ('00000000-0000-4000-8000-000000000003', 'Kağıttan Kentler',
   'Terk edilmiş bir origami atölyesinde hayat bulan kâğıt kahramanların sessiz destanı.',
   'film', 'Animasyon', 2026, 'published', now() - interval '3 days');

-- Örnek videolar (onaylı — vitrine çıkar)
insert into public.videos (id, title_id, name, season, episode, cf_uid, duration_seconds, status, published_at) values
  ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000001',
   null, null, null, 'ornek-uid-sentetik-ruya', 5400, 'approved', now() - interval '10 days'),
  ('00000000-0000-4000-9000-000000000002', '00000000-0000-4000-8000-000000000002',
   'Birinci Anlatıcı', 1, 1, 'ornek-uid-golge-s1b1', 1800, 'approved', now() - interval '6 days'),
  ('00000000-0000-4000-9000-000000000003', '00000000-0000-4000-8000-000000000002',
   'İkinci Anlatıcı', 1, 2, 'ornek-uid-golge-s1b2', 1750, 'approved', now() - interval '5 days'),
  ('00000000-0000-4000-9000-000000000004', '00000000-0000-4000-8000-000000000003',
   null, null, null, 'ornek-uid-kagittan-kentler', 4800, 'approved', now() - interval '3 days');

-- İnceleme kuyruğunda bekleyen bir örnek (admin panelini test etmek için)
insert into public.videos (title_id, name, season, episode, cf_uid, status) values
  ('00000000-0000-4000-8000-000000000002', 'Üçüncü Anlatıcı', 1, 3,
   'ornek-uid-golge-s1b3', 'in_review');

-- Son 14 güne dağılmış anonim izlenme olayları (analiz panosu için)
insert into public.watch_events (video_id, user_id, seconds, created_at)
select v.id, null, 0, now() - (random() * interval '14 days')
from public.videos v
cross join generate_series(1, 40)
where v.status = 'approved';
