# Sana Kalan Adımlar — Vaelo'i Canlıya Çıkarma

Kod tarafı bitti. Buradaki işler **hesap açma, anahtar alma ve panel yapılandırması** —
bunları senin yapman gerekiyor (Google/Cloudflare hesabın, kartın, tarayıcın gerektiği için).

**İş bölümü:**
- 🧑 **SEN yaparsın** = hesap aç, düğmeye bas, kartı gir, gizli anahtarı sen koy.
- 🤖 **BEN yaparım** = kod/komut işleri (`.env` doldurma, `db:push`, fonksiyon dağıtımı) —
  sen bana **gizli olmayan** değerleri (URL, hesap kodu) verince.
- 🔒 **Gizli anahtarlar** (API token, secret) — bunları **sen kendi koyarsın**, ben görmem.

Aşağıdaki gruplar **sıralı**: A'yı bitirmeden B'ye geçme.

---

## A) Platformu çalıştır — video hariç her şey (ÜCRETSİZ, ~10 dk)

Bu grup bitince: giriş, katalog, Listem, yarışma, analiz, arama, 5 dil — hepsi canlı çalışır.
(Sadece gerçek video oynatma B grubunu bekler.)

**A1. Supabase hesabı + projesi aç** 🧑
1. [supabase.com](https://supabase.com) → **Start your project** → **Continue with Google**
2. **New project** → ad: `latent`, bölge: `Central EU (Frankfurt)`, bir DB şifresi belirle (not et)
3. Proje "healthy" olana kadar ~2 dk bekle

**A2. Bana 2 değer ver** 🤖
Proje panelinde **Settings → API** aç, şunları kopyalayıp bana yaz:
- **Project URL** (ör. `https://abcd.supabase.co`)
- **anon public** anahtarı (`eyJ...` — bu gizli değil, RLS korur)

→ Ben bunları `.env`'e koyarım.

**A3. Veritabanını kur** 🧑 (bir kez) + 🤖
Terminalde şunu **sen** çalıştır (tarayıcıda giriş açılır):
```
npx supabase login
npx supabase link --project-ref <PROJE-REF>
```
`<PROJE-REF>` = Project URL'deki `abcd` kısmı. Sonra **ben** şunu koşarım:
```
npm run db:push      # 15 SQL göçü: tablolar + RLS + fonksiyonlar + 'art' Storage bucket'ı
```
(Tablo/haftalık görsel yarışması dahil her şey bu göçlerle kurulur — ekstra adım yok.)

**A4. Kendini admin yap** 🧑
Panelde **SQL Editor** → şunu çalıştır (önce uygulamadan bir kez kayıt ol ki satırın oluşsun):
```sql
update public.profiles set role='admin' where id=(select id from auth.users where email='SENIN-EPOSTAN');
```

✅ **Buraya kadar platform çalışır.** İstersen `npm run dev` ile açıp gez.

---

## B) Gerçek video ekle — Cloudflare Stream (ÜCRETLİ ~$5/ay)

Video yükleme/oynatma/kapak/alt yazı **sadece** bu grupla çalışır.

**B1. Cloudflare hesabı aç + Stream'i etkinleştir** 🧑
1. [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) (Google ile de olur)
2. Sol menü → **Stream** → aboneliği başlat (kart gerekir; ~$5/ay, 1000 dk depolama)

**B2. Bana hesap kodunu ver** 🤖
Stream sayfasında oynatıcı/kod URL'inde `customer-<KOD>.cloudflarestream.com` görürsün.
Bana **`<KOD>`** kısmını ver → `src/config.js`'e koyarım (gizli değil).

**B3. API token'ı SEN koy** 🔒
1. Cloudflare → sağ üst profil → **My Profile → API Tokens → Create Token**
2. **Stream** için okuma+yazma yetkili bir token oluştur, kopyala
3. Hesap ID'ni de al (Stream sayfasının sağında **Account ID**)
4. Terminalde **sen** çalıştır (token'ı ben görmem):
```
npx supabase secrets set CF_ACCOUNT_ID=<hesap-id> CF_API_TOKEN=<token> CF_WEBHOOK_SECRET=<istedigin-bir-sir>
```

**B4. Fonksiyonları dağıt** 🤖
Ben koşarım (isim vermeden **tüm** fonksiyonları dağıtır):
```
npm run fn:deploy    # create-upload, stream-webhook, add-caption,
                     # notify-new-content, ai-screen, art-cron
```

**B5. Webhook'u tanıt** 🧑
Cloudflare → **Stream → Settings → Webhooks** → şu URL'i ekle:
`https://<PROJE-REF>.supabase.co/functions/v1/stream-webhook`
(Verdiği imza sırrını B3'teki `CF_WEBHOOK_SECRET` ile aynı yap.)

✅ **Artık Yükle sekmesinden gerçek `.mp4` yükleyebilirsin** → incelemeye düşer → Panel'den onayla → yayınlanır → izle.

---

## C) İsteğe bağlı ekstralar

**C1. Google ile giriş** 🧑 (README "2b" bölümünde ayrıntılı)
- Google Cloud Console'da OAuth istemcisi oluştur (redirect: `https://<ref>.supabase.co/auth/v1/callback`)
- Supabase paneli → **Authentication → Providers → Google** → aç, Client ID + Secret yapıştır
- Düğme zaten hazır — bu iki ayar bitince çalışır.

**C2. Bildirim e-postaları (Resend)** 🔒
- [resend.com](https://resend.com) → API key al → `npx supabase secrets set RESEND_API_KEY=... MAIL_FROM="Vaelo <bildirim@alanadin>" SITE_URL=https://...`
- Panel → Edge Functions → `notify-new-content` → Schedule: `*/15 * * * *`
- (Aynı fonksiyon Tablo bildirimlerini — oylama açıldı / sergi yayında — de e-postalar.)

**C3. AI içerik ön-elemesi (Anthropic)** 🔒
- [console.anthropic.com](https://console.anthropic.com) → API key → `npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`
- Panel → Edge Functions → `ai-screen` → Schedule: `*/10 * * * *` (video metadata)
- Panel → Edge Functions → `art-screen` → Schedule: `*/10 * * * *` (Tablo görselleri — aynı anahtar)

**C5. Mobil push (Expo)** 🧑 (secret gerekmez)
- Panel → Edge Functions → `send-push` → Schedule: `*/5 * * * *` (bildirim kuyruğunu cihazlara yollar)
- Gerçek teslim için mobilde EAS projectId + EAS build gerekir (madde D/mobil).

**C4. Tablo haftalık döngüsü — tam otomatik** 🧑 (sır gerekmez)
- Tablo'yu **admin panelden manuel** de yürütebilirsin (hafta başlat → oylamayı aç →
  sonraki tur → sergiye al → haftayı kapat). Otomatik istersen:
- Panel → Edge Functions → `art-cron` → Schedule: `0 */2 * * *` (her 2 saatte, **UTC**).
  Takvim UTC 00:00'a çıpalı: Cuma eleme + tur cascade'i, Cumartesi sergi, Pazar yeni hafta.
  Ekstra secret yok (mevcut SUPABASE_URL + SERVICE_ROLE_KEY yeterli).

---

## D) İnterneti yayına al (barındırma + alan adı)

**D1. Siteyi yayınla** 🧑 + 🤖
- Ben `npm run build` alırım (`dist/` üretilir).
- Sen [Cloudflare Pages](https://pages.cloudflare.com) ya da [Vercel](https://vercel.com)'e
  depoyu bağla (Google ile giriş olur). Build komutu `npm run build`, çıktı klasörü `dist`.
- Panelde ortam değişkenleri: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- OG paylaşım kartları için `functions/` klasörü Cloudflare Pages'te otomatik algılanır;
  panelde `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CF_CODE` değişkenlerini de ekle.

**D2. Alan adı** 🧑
- Bir alan adı al (Cloudflare Registrar / Namecheap…) ve Pages/Vercel projesine bağla.

---

## Özet — en kısa yol

| Ne istiyorsun? | Yapman gerekenler |
|---|---|
| Platformu görmek (video hariç) | **A** (ücretsiz, ~10 dk) |
| Gerçek video yükleyip izlemek | **A + B** (B ~$5/ay) |
| İnternette yayında olmak | **A + B + D** |
| Google girişi / e-posta / AI | **C** (istediğini seç) |

**Şimdi bana verebileceğin ilk şey:** A1'i yap, sonra A2'deki **Project URL + anon key**'i
buraya yaz — gerisini birlikte yürütürüz. (API token gibi 🔒 değerleri yazma, onları sen
kendi terminalinde koyacaksın.)
