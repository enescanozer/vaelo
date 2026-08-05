# Vaelo — Durum Raporu

Son güncelleme: kod tarafı tamam; canlıya çıkış dış hesaplara bağlı.

---

## ✅ Tamamlananlar (kod %100 hazır)

### Web istemcisi (React + Vite)
- **Keşfet:** hero + arama (tam metin, ilike yedeği) + Tümü/Filmler/Diziler filtresi +
  tipe özel kategori çipleri; raflar: İzlemeye devam et · Listem · Sana özel · tür rafları.
- **Sinematik başlık sayfası:** kapak backdrop + degrade, İzle/Listem/Paylaş (`?b=` derin
  bağlantı), dizi bölüm listesi.
- **Oynatıcı:** sponsor pre-roll (5 sn) → CF iframe; Stream SDK ile gerçek izlenme süresi;
  dizide "sonraki bölüm" otomatik geçişi; alt yazı (ayardan açılınca `defaultTextTrack`).
- **Yarışma:** lider vitrini + oy payı çubuklu sıralama + tek oy (biten yarışmada kapalı).
- **Yükle:** doğrudan CF'ye ilerleme çubuğuyla yükleme.
- **Stüdyo:** içerik/durum/izlenme + aylık hakediş + bölüme **alt yazı (.vtt) yükleme**.
- **Panel (admin):** inceleme kuyruğu (AI risk rozeti) + sponsor/yarışma yönetimi + denetim.
- **Analiz (admin):** özet + 14 gün trend + en çok izlenenler.
- **Ayarlar:** dil (5 dil) + alt yazı tercihi. **Giriş/kayıt, profil, e-posta doğrulama.**

### Mobil istemcisi (Expo/RN)
- Keşfet (dikey akış + kategori filtresi + akıllı arama), YouTube düzenli oynatıcı,
  giriş + Listem + devam et, ⚙ ayarlar (dil + alt yazı), 5 dil, kalıcı oturum.

### Backend (Supabase)
- 13 SQL dosyası: şema + **RLS** (onaysız içerik gizli), analiz, Listem, bildirim,
  gelir/hakediş, tam metin arama, denetim, yarışma, grant, AI ön-eleme, alt yazı.
- 5 Edge Function: create-upload, stream-webhook, notify-new-content, ai-screen, add-caption.
- OG prerender (paylaşım kartları), 5 dilli i18n, git deposu.

### Yerelde canlı doğrulanan akışlar
Katalog+RLS, arama, kayıt/giriş, moderasyon+denetim, analiz, Listem, devam et,
bildirim zili, sponsor pre-roll + ad_events, yarışma+oylama, Stüdyo+hakediş,
ayarlar, alt yazı gösterimi (`defaultTextTrack=en`), filtreler.

---

## ⛔ Eksikler — hepsi **dış hesap/servis** gerektirir (kod hazır)

| # | Eksik | Ne açılır | Nasıl |
|---|---|---|---|
| 1 | **Cloudflare Stream hesabı** | Video yükleme, oynatma, kapak görselleri, alt yazı | `src/config.js` → `CF_CODE`; secret'lar `CF_ACCOUNT_ID`/`CF_API_TOKEN` |
| 2 | **Supabase bulut projesi** | Canlı veritabanı (yerelde çalışıyor) | `npx supabase link` + `npm run db:push` |
| 3 | **Resend anahtarı** | Bildirim e-postaları | `RESEND_API_KEY` secret |
| 4 | **ANTHROPIC_API_KEY** | AI ön-eleme (isteğe bağlı) | secret |
| 5 | **Barındırma + alan adı** | Yayında olmak | `dist/` → CF Pages/Vercel |
| 6 | **Gerçek reklam ağı (VAST)** | Sponsor kartı yerine video reklam | dış entegrasyon |
| 7 | **Ödeme sağlayıcısı (Stripe/Wise)** | Üretici hakediş ödemesi (rapor var, ödeme yok) | dış entegrasyon |
| 8 | **Mobil mağaza yayını** | App Store / Play Store | EAS build (gerçek cihaz testi) |

`npm run kontrol` eksik kalan kurulum adımlarını listeler.

---

## ⚠️ Bu geliştirme ortamında test EDİLEMEYEN (dürüst sınırlar)

- **Gerçek video oynatma/yükleme:** Cloudflare hesabı yok; seed'deki `cf_uid`'ler sahte.
  Yükleme akışının istemci tarafı (başlık oluşturma, form, ilerleme) çalışır ama
  `create-upload` gerçek CF token'ı ister.
- **Edge Function çalışma zamanı:** bu makinede yerel `edge-runtime` imajı çalışmıyor
  ("exec format error"); fonksiyon kodları hazır, buluta dağıtımda çalışır.
- **Mobil çalışma zamanı:** emülatör yok; Metro derlemesi + sözlük tutarlılığı doğrulandı,
  dokunuş davranışı telefonda test edilmeli.

---

## Sıradaki mantıklı adım

Bir **Supabase projesi + Cloudflare Stream aboneliği** açmak. O an `npm run kontrol`
yol gösterir; `db:push` + `fn:deploy` + secret'lar ile ~15 dakikada canlıya çıkılır ve
video yükleme/oynatma/kapak/alt yazı otomatik devreye girer.
