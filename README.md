# Latent

Tamamen **yapay zekâ ile üretilmiş film ve dizilerin** yayınlandığı, izleyiciye **her zaman
ücretsiz** streaming platformu. Reklam + sponsorlukla finanse edilir; sanatçılar izlenmeyle
kazanır. Kimliğimiz: içeriğin yalnızca AI üretimi olması.

> 📖 **Her dosyanın/ekranın ne yaptığını** öğrenmek için: [KOD-REHBERI.md](KOD-REHBERI.md)

## Mimari

```
İzleyici / Üretici (tarayıcı, React + Vite)
        │
        ├── Supabase ── Postgres (RLS) · Auth · Edge Functions
        │
        └── Cloudflare Stream ── yükleme · transcode · HLS · CDN
```

- **İnce istemci, tek backend:** web ve (ileride) mobil aynı Supabase'i konuşur.
- **Video istemci sunucusundan geçmez:** üretici, tarayıcıdan imzalı URL ile doğrudan
  Cloudflare'e yükler.
- **Güvenlik RLS'te:** onaylanmamış video / yayınlanmamış başlık hiçbir istemciye görünmez.

### Çalışan döngü
Üretici yükler → Cloudflare işler → webhook `in_review` yapar → admin onaylar → yayınlanır
→ izleyici ücretsiz izler → izlenme `watch_events`'e yazılır → analiz & hakediş.

## Kurulum

### 0. Yerel geliştirme (Docker ile, hesap gerektirmez)
```bash
npm install
npx supabase start     # yerel Postgres+Auth+API (migrations + örnek veri otomatik)
# çıktıdaki API URL ve anon key'i .env'e yaz, sonra: npm run dev
```
Not: Docker açılış hatası verirse `scripts\docker-baslat.cmd`'ye çift tıkla.

### 1. Bağımlılıklar
```bash
npm install
```

### 2. Supabase
1. [supabase.com](https://supabase.com)'da proje aç; URL + anon anahtarını `.env`'e yaz
   (bkz. `.env.example`).
2. Projeye bağlan ve şemayı it:
   ```bash
   npx supabase login
   npx supabase link --project-ref <proje-ref>
   npm run db:push        # sql/ → migrations üretir + veritabanına uygular
   ```
   Şema `sql/` altında tutulur; `npm run db:sync` bunları `supabase/migrations/`e
   çevirir (örnek veri `supabase/seed.sql`e gider, üretime GİTMEZ).
3. Kendini admin yap (SQL Editor):
   ```sql
   update public.profiles set role = 'admin' where id = '<kullanici-uuid>';
   ```

### 3. Cloudflare Stream
1. Stream aboneliği olan bir Cloudflare hesabında **hesap kodunu**
   (`customer-<KOD>.cloudflarestream.com`) `src/config.js` → `CF_CODE`'a yaz.
2. Stream okuma/yazma yetkili bir API token oluştur.

### 4. Edge Functions
```bash
npm run fn:deploy    # üç fonksiyonu birden dağıtır
                     # (stream-webhook'un JWT ayarı supabase/config.toml'da hazır)

npx supabase secrets set CF_ACCOUNT_ID=... CF_API_TOKEN=... CF_WEBHOOK_SECRET=...
npx supabase secrets set RESEND_API_KEY=... MAIL_FROM="Latent <bildirim@alanadi.com>" SITE_URL=https://...
```
- Cloudflare → Stream → Webhooks'a `stream-webhook` fonksiyonunun URL'ini ekle.
- `notify-new-content`'i Dashboard → Edge Functions → Schedule ile zamanla
  (örn. `*/15 * * * *`).

### 5. Kontrol & çalıştır
```bash
npm run kontrol   # eksik kalan kurulum adımlarını listeler
npm run dev       # yerel geliştirme
npm run build     # üretim derlemesi (dist/)
```
Dağıtım için `dist/` klasörünü Cloudflare Pages ya da Vercel'e ver;
`VITE_` env değişkenlerini barındırma panelinde tanımla.

**Paylaşım kartları (OG prerender):** `functions/[[yol]].js`, paylaşılan `?b=`
bağlantılarında başlığa özel og:title/description/image üretir. CF Pages'te
depo kökünden dağıt (build çıktısı: `dist`, functions otomatik algılanır) ve
panelde `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CF_CODE` değişkenlerini tanımla.
Yerel doğrulama: `npm run og:test` (çalışan yerel Supabase gerektirir).

## Özellikler
- **Dil desteği:** 5 dil — İngilizce (varsayılan), Türkçe, İspanyolca, Almanca,
  Fransızca; üst menüdeki seçiciyle değişir, tercih cihazda saklanır (mobilde
  döngüsel anahtar). Sözlük `src/metinler.js` — yeni metin TÜM dillere eklenir.
  Tutarlılık denetimi: `npm run dil:kontrol` (sözlükleri karşılaştırır + koddaki
  her anahtar kullanımını doğrular).
- **Keşfet:** hero + raflar (İzlemeye devam et · Listem · Sana özel · tür rafları),
  tam metin arama (turkish tsvector, ilike yedeği), `?b=` derin bağlantısı + Paylaş.
- **Oynatıcı:** sponsor pre-roll (5 sn) → Cloudflare iframe; Stream SDK ile gerçek izlenme
  süresi; dizide bölüm sonunda geri sayımlı "sonraki bölüm".
- **Yükle:** tarayıcıdan doğrudan Cloudflare'e, ilerleme çubuğuyla.
- **Stüdyo:** üreticinin içerikleri, durumları, izlenme özeti ve aylık hakediş dökümü
  (`rpm_usd` ayarı ile).
- **Yarışma:** lansman taktiği — üretici katılımı + izleyici oylaması (kişi başı tek oy).
- **Panel (admin):** inceleme kuyruğu (onayla & yayınla / reddet), sponsor ve yarışma
  yönetimi, denetim kaydı, AI ön-eleme rozeti (ai-screen — `ANTHROPIC_API_KEY` ile,
  isteğe bağlı; metadata'yı Claude değerlendirir, karar adminde kalır).
- **Analiz (admin):** özet, 14 günlük trend, en çok izlenenler, tekrar izleme oranı.
- **Bildirimler:** onayda kuyruk → uygulama içi zil + zamanlanmış Resend e-postası.

## Mobil (Expo)
`mobil/` altında aynı backend'i kullanan ince izleyici istemcisi (MVP: keşfet,
arama, detay, oynatıcı, anonim izlenme kaydı). Çalıştırmak için:
```bash
cd mobil && npm install
# config.js'te SUPABASE_URL'i ayarla (telefonla test: bilgisayarın LAN IP'si)
npx expo start        # QR'ı telefonda Expo Go ile okut
npm run dogrula       # Metro bundle derleme kontrolü (emülatörsüz)
```

## Güvenlik ilkeleri
- Her tabloda RLS açık; herkese açık okuma yalnızca yayınlanmış/onaylı içerikte.
- Video kayıtları yalnızca Edge Function (service role) açar; durum geçişleri
  webhook/admin'dedir — webhook asla doğrudan `approved` yapamaz.
- Sırlar yalnızca Edge Function secrets'ta; istemciye asla konmaz.
- Rol yükseltme istemciden engellidir (tetikleyici); analiz/hakediş fonksiyonları
  `security definer` + yetki kontrolüyle çalışır.

## Dizin yapısı
Ayrıntılı dosya haritası ve katkı kuralları için [CLAUDE.md](CLAUDE.md)'ye bak.
