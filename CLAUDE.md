# Latent — Proje Bağlamı (Claude Code için)

## Görevin
Bu klasördeki **Latent** projesinde çalışıyorsun. Kodları doğrudan buradaki dosyalara yaz;
konuşmayla açıklama üretme, gerçek dosyaları oluştur/düzenle. Yeni React bileşenleri `src/`
altına **düz** ekle ve `src/App.jsx`'e sekme olarak bağla. Her anlamlı değişiklikten sonra
`npm run build` çalıştırıp derlemenin temiz geçtiğini doğrula.

## Proje ne
Tamamen yapay zekâ ile üretilmiş **film ve dizilerin** yayınlandığı, izleyiciye **her zaman
ücretsiz** bir streaming platformu ("AI içerikleri için Netflix"). Reklam + sponsorlukla
finanse edilir, sanatçılar izlenmeyle kazanır. **Global.** Kimlik: içeriğin yalnızca AI
üretimi olması. Yarışma sadece bir edinim/lansman taktiğidir, çekirdek ürün değildir.
**UI varsayılanı İngilizce; Türkçe dil desteği var (src/i18n.jsx). Kod yorumları Türkçe.**

## Teknik yığın & mimari
- **Web:** React + Vite (bu depo).
- **Backend:** Supabase (Postgres + Auth + Edge Functions).
- **Video:** Cloudflare Stream (yükleme, transcode, HLS, CDN). Video istemci sunucusundan
  GEÇMEZ; üretici tarayıcıdan **doğrudan** Cloudflare'e imzalı URL ile yükler.
- İlke: **ince istemci, tek backend.** Web ve (ileride) mobil aynı Supabase'i konuşur.
- Mobil ileride: React Native + Expo, aynı backend.

## Çalışan döngü
Üretici yükler → Cloudflare işler → webhook videoyu `in_review` yapar → admin panelden
onaylar → yayınlanır → izleyici ücretsiz izler → izlenme `watch_events`'e yazılır → analiz.
Kritik: **onaylanmamış (`approved` olmayan) video RLS tarafından kimseye gösterilmez.**

## Dosya haritası
```
src/
  main.jsx            React giriş noktası (Dil + Ayar sağlayıcı + hata yakalayıcı)
  App.jsx             Kabuk: üst menü + sekme geçişi + ayarlar/bildirim/giriş
  AyarlarModal.jsx    Ayarlar: dil seçimi + alt yazı tercihi (otomatik göster + dil)
  ayarlar.jsx         AyarSaglayici + useAyarlar() (alt yazı tercihi, localStorage)
  Viewer.jsx          İzleyici: ana sayfa (hero+arama+filtre+raflar), sinematik detay (kapak backdrop+degrade, paylaş, ?b= derin bağlantı), oynatıcı (CF iframe + SDK ile gerçek süre)
  Contest.jsx         Yarışma: aktif yarışma, katılımlar, izleyici oylaması (lansman taktiği)
  Upload.jsx          Üretici yükleme ekranı (giriş gerekli)
  Studio.jsx          Sanatçı panosu: üreticinin içerikleri, durumları, izlenme özeti (rpc: creator_stats)
  AdminPanel.jsx      Moderasyon: inceleme kuyruğu, onayla&yayınla / reddet
  AnalyticsPanel.jsx  Analiz panosu (özet, günlük trend, en çok izlenenler, tekrar izleme)
  Auth.jsx            Giriş/kayıt modalı
  Profile.jsx         Profil düzenleme + e-posta doğrulama modalı
  auth.js             signIn/signUp/signOut + useAuth() hook (session + profile)
  catalog.js          Veri katmanı: getHero/getCatalog/getTitle/logWatch, buildRows, toCard, hlsUrl, useHomeData
  supabaseClient.js   Supabase istemcisi (VITE_ env)
  config.js           CF_CODE — Cloudflare hesap kodu (TEK yer)
  theme.js            Tasarım token'ları (renk + font + pad) — tüm ekranlar buradan okur
  i18n.jsx            Dil desteği: DilSaglayici + useLang() (en varsayılan, tr)
  metinler.js         METINLER sözlüğü — SAF veri; denetim: npm run dil:kontrol
supabase/functions/
  create-upload/       İmzalı yükleme URL'i alır + videos kaydı açar (status: uploading)
  stream-webhook/      CF "hazır" → videos.status = in_review (asla doğrudan approved değil)
  notify-new-content/  Zamanlanmış: bildirim kuyruğunu Resend ile e-postalar
  ai-screen/           Zamanlanmış: inceleme kuyruğuna Claude tabanlı metadata ön-elemesi
  add-caption/         Üretici VTT alt yazısını CF Stream captions API'sine yükler
supabase/config.toml   CLI yapılandırması (stream-webhook: verify_jwt=false)
supabase/migrations/   sql/'den ÜRETİLİR (npm run db:sync) — elle düzenleme
scripts/
  migrationlari-esitle.mjs   sql/ → migrations + seed.sql üretimi (db:sync)
  kontrol.mjs                Canlıya çıkış kontrol listesi (npm run kontrol)
  docker-baslat.cmd          Docker Desktop'ı soket-temizliğiyle başlatır (bu makine için)
mobil/                Expo istemci: hero + açıklamalı dikey akış, kategori filtresi,
                      YouTube düzenli oynatıcı (video üstte, altta bilgi + bölüm listesi),
                      akıllı arama, GİRİŞ + Listem + devam et rafları. App.js + api.js
                      (anonim okuma PostgREST, kişisel/yazma supabase-js) + auth.js +
                      supabaseClient.js (AsyncStorage'da kalıcı oturum) + i18n.js (5 dil);
                      config.js'te URL/anon key; doğrulama: npm run dogrula (Metro bundle)
functions/[[yol]].js  CF Pages Function: ?b= bağlantılarına başlığa özel OG meta
                      (test: npm run og:test — yerel Supabase'e karşı)
sql/
  01_schema.sql   Şema + RLS + profil tetikleyicisi
  02_admin_policies.sql   Adminlere inceleme/yayın erişimi
  03_analytics.sql   Analiz fonksiyonları (security definer + admin kontrolü)
  04_seed.sql   Örnek veri
  05_retention.sql   Listem + izleme ilerlemesi (watch_events update) + creator_stats
  06_notifications.sql   Bildirim tablosu + onayda kuyruğa düşüren tetikleyici
  07_revenue.sql   Sponsorlar (pre-roll) + ad_events + app_settings (rpm_usd) + creator_earnings
  08_discovery.sql   Tam metin arama (turkish tsvector + GIN)
  09_audit.sql   Denetim kaydı (durum değişimi tetikleyicileri)
  10_contest.sql   Yarışmalar + katılımlar + oylar (yarışma başına tek oy) + contest_results
  11_grants.sql   Şema grant'ları (bulutta varsayılan; yerel/özel kurulumda şart)
  12_moderation.sql   AI ön-eleme alanları (videos.ai_risk/ai_ozet/ai_incelendi_at)
  13_captions.sql   Alt yazı (videos.captions[]) + creator_stats'a cf_uid/captions
```

## Kurallar — bunlara MUTLAKA uy
1. **Dil:** arayüz metinleri `src/metinler.js`'teki METINLER sözlüğünden gelir — sabit
   metin YAZMA. Varsayılan İngilizce; her yeni metin BEŞ dile birden (en/tr/es/de/fr)
   eklenir ve `npm run dil:kontrol` temiz geçmelidir. `s` = TAM dil tablosuna ayrıldı.
   Kod yorumları Türkçe. Tarih/sayı biçimlerinde `s.locale` kullan. Mobilde aynı örüntü:
   `mobil/i18n.js` (erişim adı `d`).
2. **Tasarım:** sade, Netflix/HBO gibi, minimal, kalabalık DEĞİL. Koyu tema. Tek vurgu rengi
   az kullanılır (sadece ana aksiyon). Mevcut token'ları kullan:
   ```
   bg #0A0A0B · surface #121214 / #15151A · çizgi #222226 · metin #ECEEE9
   sönük #8C8F88 · vurgu (lime) #CDFF4A · tehlike #E2574C
   Başlık fontu: 'Syne'  ·  Gövde fontu: 'Hanken Grotesk'
   ```
   Stiller mevcut örüntüye uygun inline `style` ile. Aşırı formatlama, dekoratif gürültü,
   gereksiz kenarlık/gölge yok. Bol boşluk, içerik öncelikli.
3. **Güvenlik:** her yeni tabloya RLS aç. Herkese açık okuma yalnızca yayınlanmış/onaylı
   içerikte. Onaylanmamış video/başlık kimseye görünmez. Admin/moderasyon işlemleri admin
   RLS ya da service role ile. Sırlar (Cloudflare token vb.) yalnızca Edge Function secrets'ta;
   ASLA istemciye koyma.
4. **Video:** her zaman doğrudan yükleme (client → Cloudflare). Sunucudan geçirme.
5. **Cloudflare kodu:** yalnızca `src/config.js`'teki `CF_CODE`. Başka yere sabitleme;
   gereken yerde `import { CF_CODE } from "./config"`.
6. **Örüntü takibi:** mevcut dosya düzenini ve kod stilini izle. Yeni ekran eklerken `App.jsx`'e
   sekme olarak bağla (gerekiyorsa admin-only). Yeni veri erişimini `catalog.js` benzeri
   fonksiyonlarla soyutla.
7. **State:** localStorage/sessionStorage yerine kalıcı veri Supabase'te; UI durumu React state.
8. **Env:** yeni gizli/URL için `VITE_` ön eki ve `.env.example`'ı güncelle.

## Çalışma tarzı
- Küçük, çalışan adımlar at; her adımda ne yaptığını 1-2 cümleyle söyle.
- Her anlamlı değişiklik sonrası `npm run build` ile doğrula; hata varsa düzelt.
- Yeni SQL gerekiyorsa `sql/` altına numaralı yeni dosya ekle ve nasıl çalıştırılacağını yaz.
- Belirsizlik varsa, en makul varsayımı yap ve varsayımı belirt; akışı durdurma.

## Yapılmış olanlar
- Çekirdek döngü: yükleme (doğrudan CF) → webhook → inceleme → yayın → izleme → analiz.
- Tutundurma: "İzlemeye devam et", "Listem" (my_list + RLS), arama (tsvector + ilike yedeği).
- Gerçek izlenme süresi: Stream SDK `timeupdate`/`ended` → watch_events.seconds
  (girişli kullanıcıda; anonimde yalnızca görüntülenme).
- Sanatçı panosu (Stüdyo) + aylık hakediş raporu (creator_earnings, rpm_usd ayarı).
- Profil düzenleme, e-posta doğrulama şeridi/yeniden gönderme.
- Bildirimler: onayda kuyruk (tetikleyici) → uygulama içi zil + Resend e-postası
  (notify-new-content, zamanlanmış).
- Gelir: sponsor pre-roll kartı (5 sn) + gösterim/tıklama olayları + panelden yönetim.
- Keşif: izleme geçmişine göre "Sana özel" rafı, dizilerde "sonraki bölüm" otomatik geçişi.
- Keşfet filtreleri: Tümü/Filmler/Diziler + seçili tipe özel kategori çipleri (alt satır),
  süzülmüş ızgara + başlık sayacı.
- Performans: katalog + başlık detayı + kişisel raflar + yarışma önbellekli
  (…Tazele ile boşalır; yarışma sekmesi gezmede 0 ek istek), bildirimler yalnızca
  girişte + zil açılınca, CF kurulu değilken kapak isteği yok (CF_KURULU), lazy <img>,
  StrictMode kapalı (gerekçe main.jsx'te), createRoot idempotent (HMR-güvenli),
  admin/üretici ekranları (Upload/Studio/AdminPanel/AnalyticsPanel) React.lazy chunk.
- Yarışma ekranı: lider vitrini (ÖNDE) + oy payı çubuklu sıralama listesi +
  meta satırı (kalan gün · katılımcı · toplam oy).
- Moderasyon: durum değişimlerinde denetim kaydı (audit_log), panelde son işlemler.
- Paylaşım: ?b= derin bağlantısı + detayda "Paylaş" (panoya kopyala) + OG meta (site geneli).
- Yarışma modülü: admin panelden yarışma açma, üretici katılımı, izleyici oylaması
  (yarışma başına tek oy, değiştirilebilir), sıralamalı vitrin.
- Dil desteği: 5 dil (EN varsayılan, TR/ES/DE/FR) — üst menüde Ayarlar (⚙) içinde seçici;
  mobilde döngüsel anahtar. Tarih/sayı biçimleri s.locale ile. Tüm ekranlar sözlükten okur.
- Ayarlar: ⚙ modalı (dil + alt yazı tercihi: otomatik göster + dil, localStorage).
- Alt yazı: izleyici tarafı tam (ayardan açılınca oynatıcı iframe'ine defaultTextTrack);
  üretici tarafı Stüdyo'dan VTT yükleme → add-caption → CF captions API (videos.captions).
- AI ön-eleme: ai-screen (zamanlanmış, claude-opus-4-8 + yapılandırılmış çıktı) →
  videos.ai_risk/ai_ozet; panel kuyruğunda risk rozeti. Karar adminde kalır.
- UX: duyarlı dolgu (t.pad) + clamp başlıklar, kart hover, iskelet yüklenme ekranı,
  focus-visible odak halkası, ESC ile modal kapatma, logo→ana sayfa, hata yakalayıcı.

## Yapılacaklar (öncelik sırası)
1. **Canlıya çıkış:** gerçek Supabase + Cloudflare hesabı bağla, fonksiyonları dağıt,
   webhook'u tanıt, barındırma (CF Pages/Vercel) + alan adı, uçtan uca test.
2. **Gerçek reklam ağı:** sponsor kartı yerine/yanına VAST/pre-roll video reklam;
   üretici ödemesi (Stripe Connect / Wise) entegrasyonu.
3. **Moderasyon ölçekleme:** metadata ön-elemesi hazır (ai-screen); sırada
   transkript/kare analizi ve çoklu admin rolleri.
4. **Mobil mağaza yayını:** izleyici + giriş + Listem + devam et + 5 dil hazır;
   sırada uygulama içi bildirimler ve EAS build ile mağaza paketi (telefonda uçtan
   uca test gerekir — bu ortamda emülatör yok).

## Bu turdaki görev
> Buraya, bu oturumda yapılmasını istediğin işi yaz. Örnek:
> "Tutundurma katmanını başlat: `watch_events`'i kullanarak Keşfet'in en üstüne
> 'İzlemeye devam et' rafını ekle ve `Listem` özelliğini (tablo + RLS + UI) kur."
