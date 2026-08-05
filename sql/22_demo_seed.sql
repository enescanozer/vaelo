-- 22_demo_seed.sql — DEMO içerik (UI testi için geçici katalog)
--
-- Amaç: bulut kataloğunu boş olmaktan çıkarmak → arama, filtre (Tümü/Filmler/Diziler),
-- tür çipleri ve kart render'ı gerçek satırlarla uçtan uca test edilebilsin.
-- Video DOSYASI ya da Cloudflare Stream GEREKTİRMEZ: her başlığa cf_uid=NULL bir
-- 'approved' video eklenir → katalog filtresini (videos.length > 0) geçer, kapak
-- harf-yedeğine düşer (CF'e hiç istek çıkmaz). OYNATMA çalışmaz — bu bilinçli;
-- gerçek oynatma Cloudflare Stream (Option B) ile gelir.
--
-- ÇALIŞTIRMA: Supabase Dashboard → SQL Editor → bu dosyayı yapıştır → Run.
--   (SQL Editor postgres rolüyle çalışır, RLS'yi baypas eder; doğrudan 'published'
--    başlık + 'approved' video eklenebilir.)
-- İdempotent: sabit UUID'ler + ON CONFLICT DO NOTHING → tekrar çalıştırmak güvenli.
--
-- TEMİZLİK (gerçek lansmandan önce demo'yu kaldır): dosyanın en altındaki
--   "-- DEMO TEMİZLİK" bloğunu ayrı çalıştır.

-- ————— Başlıklar (4 film + 2 dizi, çeşitli türler) —————
insert into public.titles (id, creator_id, name, description, kind, genre, year, status, published_at)
values
  ('11111111-1111-4111-8111-111111110001', null,
   'Neon Genesis Dawn',
   'A fully AI-generated cyberpunk odyssey: a courier races through a rain-soaked megacity where memories are currency.',
   'film', 'Sci-Fi', 2025, 'published', now() - interval '1 hour'),

  ('11111111-1111-4111-8111-111111110002', null,
   'The Last Analog',
   'In a world that has forgotten how to feel, a retired archivist restores the final reel of human-made film.',
   'film', 'Drama', 2024, 'published', now() - interval '2 hour'),

  ('11111111-1111-4111-8111-111111110003', null,
   'Paper Skies',
   'A hand-drawn-style animated short about a girl who folds origami birds that come to life at dusk.',
   'film', 'Animation', 2025, 'published', now() - interval '3 hour'),

  ('11111111-1111-4111-8111-111111110004', null,
   'Synthetic Minds',
   'A documentary exploring how generative models learn to dream — narrated entirely by synthetic voices.',
   'film', 'Documentary', 2025, 'published', now() - interval '4 hour'),

  ('11111111-1111-4111-8111-111111110005', null,
   'Signal Lost',
   'A deep-space maintenance crew receives a transmission that should not exist. Every episode, the signal gets closer.',
   'dizi', 'Thriller', 2025, 'published', now() - interval '5 hour'),

  ('11111111-1111-4111-8111-111111110006', null,
   'Prompt & Circumstance',
   'A workplace comedy set inside an AI studio where the models keep taking their prompts a little too literally.',
   'dizi', 'Comedy', 2024, 'published', now() - interval '6 hour')
on conflict (id) do nothing;

-- ————— Videolar (her başlığa en az bir 'approved'; cf_uid=NULL → harf kapak) —————
-- Filmler: tek bölüm. Diziler: 2 bölüm (sezon/bölüm listesi de test edilsin).
insert into public.videos (id, title_id, creator_id, name, season, episode, cf_uid, duration_seconds, status, published_at)
values
  -- Filmler
  ('11111111-1111-4111-8111-1111111a0001', '11111111-1111-4111-8111-111111110001', null, null, null, null, null, 5400, 'approved', now() - interval '1 hour'),
  ('11111111-1111-4111-8111-1111111a0002', '11111111-1111-4111-8111-111111110002', null, null, null, null, null, 6300, 'approved', now() - interval '2 hour'),
  ('11111111-1111-4111-8111-1111111a0003', '11111111-1111-4111-8111-111111110003', null, null, null, null, null, 720,  'approved', now() - interval '3 hour'),
  ('11111111-1111-4111-8111-1111111a0004', '11111111-1111-4111-8111-111111110004', null, null, null, null, null, 4800, 'approved', now() - interval '4 hour'),
  -- Dizi: Signal Lost — S1B1, S1B2
  ('11111111-1111-4111-8111-1111111a0005', '11111111-1111-4111-8111-111111110005', null, 'The Echo', 1, 1, null, 2700, 'approved', now() - interval '5 hour'),
  ('11111111-1111-4111-8111-1111111a0006', '11111111-1111-4111-8111-111111110005', null, 'Closer',   1, 2, null, 2760, 'approved', now() - interval '5 hour'),
  -- Dizi: Prompt & Circumstance — S1B1, S1B2
  ('11111111-1111-4111-8111-1111111a0007', '11111111-1111-4111-8111-111111110006', null, 'Onboarding',   1, 1, null, 1500, 'approved', now() - interval '6 hour'),
  ('11111111-1111-4111-8111-1111111a0008', '11111111-1111-4111-8111-111111110006', null, 'Standup Sync', 1, 2, null, 1440, 'approved', now() - interval '6 hour')
on conflict (id) do nothing;

-- ————— DEMO TEMİZLİK (gerçek lansmandan önce AYRI çalıştır) —————
-- Sadece bu demo satırlarını siler (id ön eki '11111111-1111-4111-8111-1111...'):
--
--   delete from public.videos where id::text like '11111111-1111-4111-8111-1111111a%';
--   delete from public.titles where id::text like '11111111-1111-4111-8111-11111111000%';
