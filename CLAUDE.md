# Vaelo — Proje Bağlamı (Claude Code için)

## Görevin
Bu klasördeki **Vaelo** projesinde çalışıyorsun. Kodları doğrudan buradaki dosyalara yaz;
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
  Tablo.jsx           Haftalık AI görsel yarışması: gönderim (haftada 1) + ANONİM eleme
                      (oy) + sergi (son 50, sahipli, puanlanır) + admin hafta kontrolü
  sanat.js            Tablo veri katmanı: getBuHafta/getSergi/getOySeti/artOyVer/eserGonder
                      + admin (artElemeBaslat/artSonrakiTur/artSergiyeAl/artHaftaBitir)
  Auth.jsx            Giriş/kayıt modalı (e-posta/şifre + Google ile giriş — OAuth)
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
  art-screen/          Zamanlanmış: Tablo görsellerine Claude VISION ön-elemesi (ai_risk)
  add-caption/         Üretici VTT alt yazısını CF Stream captions API'sine yükler
  generate-captions/   AI çok-dilli senkron alt yazı: CF transkripsiyonu (senkron VTT) +
                       Claude çevirisi (zaman damgaları KORUNUR) → 5 dil track'i CF'e yükler
  art-cron/            Zamanlanmış: Tablo haftalık döngüsü (UTC 00:00 çıpalı) —
                       art_lifecycle_ilerlet() RPC'sini service_role ile çağırır
  send-push/           Zamanlanmış: bildirim kuyruğunu (push_sent_at boş) Expo Push API
                       ile mobil cihazlara gönderir (secret gerekmez)
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
                      config.js'te URL/anon key; doğrulama: npm run dogrula (Metro bundle).
                      Tablo sekmesi: gönderim (expo-image-picker → Storage) + anonim eleme
                      + sergi (sahipli, puanlanır) — web ile aynı RLS/rpc katmanı.
                      Push: expo-notifications ile giriş sonrası token kaydı (push_tokens);
                      EAS projectId/cihaz yoksa sessiz geçer, kurulunca çalışır.
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
  14_art.sql   Tablo: 'art' Storage bucket + art_weeks/art_pieces/art_votes (RLS) +
               anonim oy seti/sergi fonksiyonları (eleme'de creator_id istemciye gelmez)
  15_art_notify.sql   Tablo bildirimleri: notifications'a art_week_id + art_eleme/art_sergi;
               hafta durumu değişince kuyruğa düşüren tetikleyici (eleme→örneklem, sergi→herkes)
  16_art_cron.sql   Haftalık döngü otomasyonu: art_lifecycle_ilerlet() (UTC 00:00 çıpalı,
               idempotent) + kapısız çekirdek art_tur_uygula (admin RPC + cron tek kaynak)
  17_art_moderation.sql   Tablo moderasyonu: 'kaldirildi' durumu + art_kaldir (admin) +
               art_reports (izleyici bildirimi, RLS) — kaldırılan eser oy setinde/sergide görünmez
  18_roles.sql   Çoklu yetki: 'moderator' rolü + is_moderator() (içerik moderasyonu);
               içerik ilkeleri is_admin→is_moderator; admin rol atar (rol koruma trigger'ı:
               admin'e yükseltme yalnız service_role). Gelir/analiz/yaşam döngüsü is_admin kalır.
  19_art_screen.sql   Tablo AI ön-eleme alanları (art_pieces.ai_risk/ai_ozet/ai_incelendi_at)
               + moderatör okuma; art-screen Edge Function (Claude vision) yazar
  20_push.sql   Mobil push: push_tokens (cihaz token'ı, RLS) + notifications.push_sent_at;
               send-push Edge Function Expo Push API ile gönderir
  21_creator_apply.sql   Üretici başvuru+onay: creator_basvurulari (RLS) + creator_onayla
               (role=creator) / creator_reddet + yarisma_penceresi() (yarışma sekmesi görünürlüğü)
```

## Kurallar — bunlara MUTLAKA uy
1. **Dil:** arayüz metinleri `src/metinler.js`'teki METINLER sözlüğünden gelir — sabit
   metin YAZMA. Varsayılan İngilizce; her yeni metin SEKİZ dile birden
   (en/ru/zh/ar/tr/es/de/fr) eklenir ve `npm run dil:kontrol` temiz geçmelidir.
   `s` = TAM dil tablosuna ayrıldı. Arapça RTL: i18n.jsx `document.dir`'i çevirir
   (düzen cilası bekliyor). Kod yorumları Türkçe. Tarih/sayı biçimlerinde `s.locale`
   kullan. Mobilde aynı örüntü: `mobil/i18n.js` (erişim adı `d`).
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
- Dil desteği: 8 dil (EN varsayılan · RU/ZH/AR/TR/ES/DE/FR) — Ayarlar (⚙) içinde seçici;
  Arapça sağdan-sola (dir=rtl set edilir; ince düzen cilası + ZH/AR ana-dil kontrolü bekliyor).
  Eski: 5 dil (EN varsayılan, TR/ES/DE/FR) — üst menüde Ayarlar (⚙) içinde seçici;
  mobilde döngüsel anahtar. Tarih/sayı biçimleri s.locale ile. Tüm ekranlar sözlükten okur.
- Ayarlar: ⚙ modalı (dil + alt yazı tercihi: otomatik göster + dil, localStorage).
- Alt yazı: izleyici tarafı tam (ayardan açılınca oynatıcı iframe'ine defaultTextTrack;
  CF player CC menüsüyle diller arası geçiş); üretici tarafı Stüdyo'dan (a) manuel VTT yükleme
  → add-caption, (b) "AI ile üret" → generate-captions: CF transkripsiyonu senkron VTT üretir,
  Claude cue METNİNİ çevirir (zaman damgalarına dokunmadan) → 5 dil track'i. Senkron garanti
  (tüm diller aynı damgaları paylaşır); VTT ayrıştır/birleştir mantığı yerelde test edildi.
- AI ön-eleme: ai-screen (zamanlanmış, claude-opus-4-8 + yapılandırılmış çıktı) →
  videos.ai_risk/ai_ozet; panel kuyruğunda risk rozeti. Karar adminde kalır.
- Tablo (haftalık AI görsel yarışması): gönderim (haftada 1, Storage'a doğrudan yükleme) →
  ANONİM tur-tur eleme (oy; sahip istemciye HİÇ gelmez, fonksiyon katmanında garanti) →
  son 50 sergi (sahipli + sosyal linkler, hâlâ puanlanır). Admin hafta kontrolü
  (başlat/oylamaya aç/sonraki tur/sergiye al/haftayı kapat). Web + mobil (expo-image-picker).
- Tablo bildirimleri (UTC 00:00 çıpalı): eleme başlayınca rastgele örnekleme "oylamaya çağır"
  art_eleme, sergi açılınca herkese art_sergi — hafta durumu tetikleyicisiyle kuyruğa; zil
  (tıklayınca Tablo) + Resend e-postası (notify-new-content art türlerini de işler).
- Tablo otomasyonu: art_lifecycle_ilerlet() (Pzt–Prş gönderim · Cuma eleme+cascade ·
  Cts sergi · Paz kapan+yeni), idempotent; art-cron edge fonksiyonu service_role ile çağırır.
  PROD kararına göre zamanlanır (0 */2 * * *); manuel admin kontrolü her zaman elde.
  50 GARANTİSİ: eleme'de oy sıralaması ADİL — eşitlik/oy-yok rastgele bozulur (en erken
  gönderen avantajı yok). Kimse oylamasa da Cts top 50'yi sergiye alır; Cuma tümden kaçıp
  hafta 'gonderim'de kalsa bile Cts doğrudan top 50'yi sergiler (≥50 gönderim varsa hep 50).
- Tablo moderasyonu: admin/moderatör eseri kaldırır (durum 'kaldirildi' → oylama/sergiden
  anında çıkar), izleyici "bildir" (art_reports, kişi başına tek); yetkili rapor sayısını (⚑) görür.
  Web + mobil (mobilde izleyici bildirimi; kaldırma web'de). İçerik güvenliği (kural 3).
- Tablo AI ön-eleme: art-screen (zamanlanmış, claude-opus-4-8 VISION + yapılandırılmış çıktı) →
  art_pieces.ai_risk/ai_ozet; moderasyon görünümünde ⚠ risk rozeti (Eleme + Sergi). Karar yetkili.
- Mobil push (iskelet): push_tokens + expo-notifications token kaydı (giriş sonrası) →
  send-push zamanlanmış fonksiyonu bildirim kuyruğunu Expo Push API ile gönderir. Uçtan uca
  test için EAS build + gerçek cihaz gerekir (bu ortamda yok); kod + veri modeli hazır/doğrulandı.
- İki kapılı üretici akışı: (1) izleyici "Üretici ol" başvurusu (CreatorBasvuru) → admin
  AdminPanel'de onaylar → role=creator → Yükle/Stüdyo açılır; (2) her video in_review →
  admin onaylar → approved (RLS: onaysız video kimseye görünmez). Başvuru olmadan yükleme yok.
- Sade menü (rol-bazlı sekme görünürlüğü): anon/izleyici → Keşfet + Tablo (Cuma HARİÇ; eleme
  günü gizli, Cts sergiyle başlar) + Yarışma (yalnız aktif VEYA bitiş+2 hafta = yarisma_penceresi).
  İzleyici ayrıca "Üretici ol" görür; onaylı üretici Yükle/Stüdyo; moderatör Panel; admin Analiz.
- Roller: 'moderator' rolü (is_moderator) — inceleme kuyruğu + Tablo moderasyonu görür,
  gelir/analiz/yarışma/rol yönetimi GÖRMEZ. Admin panelden rol atama (moderator/creator/viewer);
  'admin'e yükseltme yalnız SQL Editor (service role). Sekmeler: panel=modGerekli, analiz=adminGerekli.
- UX: duyarlı dolgu (t.pad) + clamp başlıklar, kart hover, iskelet yüklenme ekranı,
  focus-visible odak halkası, ESC ile modal kapatma, logo→ana sayfa, hata yakalayıcı.
- Güvenlik sertleştirme: kullanıcı-girdisi URL'ler yalnız http/https (guvenliUrl — sosyal
  linkler web+mobil, sponsor window.open); XSS (javascript:/data:) engellendi, güvensiz link
  düz metne düşer. 'art' Storage bucket'ı yalnız görsel türleri + 10 MB. Tüm tablolarda RLS,
  tüm SECURITY DEFINER'larda search_path, analiz fonksiyonlarında is_admin guard doğrulandı.
- Performans: Tablo eleme oy sayımı (art_tur_uygula) ilişkili alt-sorgu yerine TEK gruplu
  tarama (art_votes_sayim_idx) — turnuva ölçeğinde O(N) yerine tek toplama.

## Yapılacaklar (öncelik sırası)
1. **Canlıya çıkış:** gerçek Supabase + Cloudflare hesabı bağla, fonksiyonları dağıt,
   webhook'u tanıt, barındırma (CF Pages/Vercel) + alan adı, uçtan uca test.
   Tablo için: art-cron'u UTC zamanlamayla planla (0 */2 * * *) — böylece haftalık döngü
   tam otomatik olur (şimdilik admin panelden manuel de sürebilir).
2. **Gerçek reklam ağı:** sponsor kartı yerine/yanına VAST/pre-roll video reklam;
   üretici ödemesi (Stripe Connect / Wise) entegrasyonu.
3. **Moderasyon ölçekleme:** metadata ön-elemesi (ai-screen) + Tablo moderasyonu +
   çoklu admin/moderatör rolleri hazır; sırada transkript/kare analizi ve Tablo
   görselleri için AI ön-eleme (görsel → Claude vision).
4. **Mobil mağaza yayını:** izleyici + giriş + Listem + devam et + 5 dil + Tablo + push
   token kaydı (kod) hazır; sırada EAS projectId + EAS build ile mağaza paketi ve cihazda
   uçtan uca doğrulama (image-picker → Storage yüklemesi, gerçek push teslimi — bu ortamda
   cihaz/emülatör yok). send-push zamanlanması: Dashboard → send-push → */5 * * * *.

## Bu turdaki görev
> Buraya, bu oturumda yapılmasını istediğin işi yaz. Örnek:
> "Tutundurma katmanını başlat: `watch_events`'i kullanarak Keşfet'in en üstüne
> 'İzlemeye devam et' rafını ekle ve `Listem` özelliğini (tablo + RLS + UI) kur."
