-- Bu dosya sql/23_demo_video.sql dosyasından üretildi — ELLE DÜZENLEME, sql/ altını değiştirip
-- `npm run db:sync` çalıştır.

-- 23_demo_video.sql — DEMO videolarına gerçek Cloudflare Stream UID'i bağla
--
-- Amaç: 22_demo_seed.sql'deki cf_uid=NULL demo videolarından BİRKAÇINA gerçek CF
-- Stream UID'i vererek Watch düğmesini uçtan uca oynatılabilir yapmak — katalog/
-- arama/filtre/kart mantığına DOKUNMADAN (yalnız iki satır UPDATE).
--
-- ÖN KOŞUL:
--   1) Cloudflare Stream'e 2 test videosu yüklendi, UID'leri alındı.
--   2) src/config.js + mobil/config.js içindeki CF_CODE gerçek hesap koduyla değişti
--      (yoksa CF_KURULU=false kalır, oynatıcı/thumbnail devreye girmez).
--
-- KULLANIM: aşağıdaki 'BURAYA_...' yer tutucularını gerçek UID'lerle değiştir →
--   Supabase Dashboard → SQL Editor → Run.
-- İdempotent: UPDATE tekrar çalıştırılabilir.
--
-- Not: cf_uid dolunca o başlık HEM oynar HEM gerçek CF thumbnail'i gösterir
-- (gradient poster yerine). Diğer demo başlıklar cf_uid=NULL → posterli kalır,
-- Watch'a basılırsa oynatıcı boş gelir (bilinçli — yalnız aşağıdaki 2 başlık test edilir).

-- Film: "Neon Genesis Dawn" (tek bölüm)
update public.videos
set cf_uid = 'BURAYA_NEON_UID'          -- ör: 'a1b2c3d4e5f6...' (CF video UID'i)
where id = '11111111-1111-4111-8111-1111111a0001';

-- Dizi: "Signal Lost" S1·B1 ("The Echo")
update public.videos
set cf_uid = 'BURAYA_SIGNAL_S1B1_UID'
where id = '11111111-1111-4111-8111-1111111a0005';

-- (İstersen daha fazla bölüme de bağlayabilirsin — aynı örüntü, farklı id + UID.)
--
-- GERİ ALMA (test bitince UID'leri kaldırıp posterli demo'ya dönmek için):
--   update public.videos set cf_uid = null
--   where id in ('11111111-1111-4111-8111-1111111a0001',
--                '11111111-1111-4111-8111-1111111a0005');
