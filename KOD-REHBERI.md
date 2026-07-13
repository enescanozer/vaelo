# Latent — Kod Rehberi

Bu belge, projedeki **her dosyanın ne işe yaradığını** ve ekranların birbirine
nasıl bağlandığını sade dille anlatır. Kurulum/çalıştırma için [README.md](README.md),
katkı kuralları için [CLAUDE.md](CLAUDE.md).

---

## 1. Latent nedir?

Tamamen yapay zekâ ile üretilmiş **film ve dizilerin** yayınlandığı, izleyiciye
**her zaman ücretsiz** bir streaming platformu. Reklam + sponsorlukla finanse edilir,
sanatçılar izlenmeyle kazanır. İki istemci (web + mobil) **aynı Supabase backend'ini**
konuşur.

### Genel mimari

```
   İzleyici / Üretici / Admin
        │
   ┌────┴─────────────────────────────────┐
   │  Web (React+Vite)   Mobil (Expo/RN)   │  ← ince istemci
   └────┬─────────────────────────┬────────┘
        │                         │
        ▼                         ▼
   Supabase  (Postgres + RLS · Auth · Edge Functions)   ← tek backend
        │
        ▼
   Cloudflare Stream  (video yükleme · transcode · HLS · CDN · alt yazı)
```

**İlke:** İnce istemci, tek backend. Video hiçbir zaman sunucudan geçmez — üretici
tarayıcıdan **doğrudan** Cloudflare'e imzalı URL ile yükler. Güvenlik veritabanında
(RLS) yaşar: onaylanmamış video / yayınlanmamış başlık hiçbir istemciye görünmez.

### Çalışan döngü

```
Üretici yükler → Cloudflare işler → webhook "in_review" yapar →
admin onaylar → yayınlanır → izleyici ücretsiz izler →
izlenme watch_events'e yazılır → analiz & hakediş
```

---

## 2. Web istemcisi — `src/`

### Altyapı ve kabuk

| Dosya | Ne yapar |
|---|---|
| **main.jsx** | React giriş noktası. Sağlayıcıları sıralar: `HataYakalayici` (beklenmedik çökmede boş ekran yerine "Sayfayı yenile" kurtarma ekranı) → `DilSaglayici` → `AyarSaglayici` → `App`. Root **idempotent** kurulur (`globalThis.__latentKok`) — sıcak-güncellemede çift `createRoot` uyarısını önler. |
| **App.jsx** | Uygulama kabuğu: üst menü, **sekme geçişi**, bildirim zili, ⚙ ayarlar/profil/giriş modalları, e-posta doğrulama şeridi, alt bilgi (AI beyanı). Sekmeler: Keşfet · Yarışma · Yükle · Stüdyo · Panel · Analiz (son ikisi yalnız admin, "Yükle/Stüdyo" giriş ister). Üretici/admin ekranları **React.lazy** ile ayrı chunk'tan yüklenir. |
| **theme.js** | Tasarım token'ları — tek yer. Renkler (bg `#0A0A0B`, vurgu lime `#CDFF4A`, tehlike, çizgi…), fontlar (başlık `Syne`, gövde `Hanken Grotesk`), duyarlı yatay dolgu `pad`. Tüm ekranlar buradan okur. |
| **config.js** | `CF_CODE` — Cloudflare hesap kodu (TEK yer). `CF_KURULU` bayrağı: gerçek kod girilmemişse kapak URL'i üretilmez (yereldeki sahte alan adına giden askıda istekler engellenir). |
| **supabaseClient.js** | Supabase istemcisi. `.env` yokken bile kabuk açılır (uyarıyla), veri istekleri "alınamadı" durumu gösterir. |

### Bağlamlar (React Context)

| Dosya | Ne yapar |
|---|---|
| **i18n.jsx** | Dil desteği: `DilSaglayici` + `useLang()` hook'u. Varsayılan İngilizce; TR/ES/DE/FR seçilebilir. Tercih cihazda (localStorage) saklanır, `<html lang>` ve taban sekme başlığı dille eşlenir. Metinlerin kendisi ayrı dosyada. |
| **metinler.js** | `METINLER` sözlüğü — **saf veri** (JSX yok). 5 dil × ~195 anahtar, ekran başına gruplu. Ara değerli metinler fonksiyon (örn. `oy: (n) => ...`). Denetim: `npm run dil:kontrol`. |
| **ayarlar.jsx** | İzleyici ayarları bağlamı: `AyarSaglayici` + `useAyarlar()`. Alt yazı tercihini tutar (`altyaziAcik`, `altyaziDil`), localStorage'da kalıcı. Kullanıcı hesabı gerektirmez (cihaz tercihi). |

### Veri katmanı

| Dosya | Ne yapar |
|---|---|
| **catalog.js** | **Tüm veri erişiminin merkezi.** Cloudflare URL yardımcıları (`hlsUrl`, `iframeUrl` — alt yazı/başlangıç parametreli, `thumbUrl`), katalog/başlık/arama okuma, izlenme kaydı (`logWatch`/`updateWatchSeconds`), Listem, "devam et", bildirimler, sponsor/reklam, öneri (`getWatchedGenres`), yarışma. **Önbellek katmanı** burada: katalog, başlık detayı, kişisel raflar ve yarışma verisi TTL'li önbelleklenir; ilgili yazma işlemleri `…Tazele()` ile boşaltır. |
| **auth.js** | `signIn/signUp/signOut` + `useAuth()` hook'u. Oturum + `profiles` satırını (rol dahil) birlikte döndürür; `profilYenile()` ile elle tazelenir. |

### Ekranlar

**Viewer.jsx** — İzleyicinin ana deneyimi. Üç iç görünüm barındırır:

- **Ana sayfa (Keşfet):** Arama kutusu + **filtre çubuğu** (Tümü/Filmler/Diziler; tip
  seçilince altında o tipe özel kategori çipleri) + hero (en yeni başlık, sinematik
  degrade) + raflar. Girişli kullanıcıda "İzlemeye devam et", "Listem", "Sana özel"
  (izleme geçmişine göre) rafları öne gelir; ardından "Yeni eklenenler" ve tür rafları.
  Yükleme sırasında **nabız atan iskelet** gösterilir. Filtre seçiliyse raflar yerine
  süzülmüş ızgara + başlık sayacı gelir.
- **Detay (başlık sayfası):** Full-width **kapak backdrop + degrade** üstüne büyük
  başlık (Netflix/HBO hissi); altında açıklama, İzle/Listeme ekle/**Paylaş**
  (`?b=` derin bağlantısını panoya kopyalar) düğmeleri ve dizilerde bölüm listesi.
  Sekme başlığı içerik adıyla eşlenir.
- **Oynatıcı:** Aktif sponsor varsa **5 sn'lik pre-roll kartı** (gösterim/tıklama
  `ad_events`'e yazılır) → sonra Cloudflare iframe. Stream SDK ile `timeupdate`/`ended`
  dinlenip **gerçek izlenme süresi** `watch_events`'e yazılır. Dizide bölüm bitince
  geri sayımlı "**sonraki bölüm**" otomatik geçişi. Ayarlarda alt yazı açıksa iframe'e
  `defaultTextTrack` eklenir (tercih video açılışında sabitlenir — izlerken değişip
  videoyu başa sarmaz).

**Contest.jsx** — Yarışma (lansman taktiği). Lider vitrini ("ÖNDE" rozetli büyük kart) +
oy payı çubuklu sıralama listesi + meta satırı (kalan gün · katılımcı · toplam oy).
Girişli üretici yayınlanmış başlığıyla katılır; izleyici oy verir (yarışma başına tek
oy, değiştirilebilir). Süresi bitince salt-sonuç görünümü. Tüm veri **tek önbellekli
çağrıdan** gelir (`getYarismaVerisi`) — sekme gezmede tekrar istek atılmaz.

**Upload.jsx** — Üretici yükleme (giriş gerekli). Yeni başlık ya da mevcut başlığa bölüm.
Akış: taslak başlık oluştur → `create-upload` Edge Function'dan **imzalı URL** al →
dosyayı **tarayıcıdan doğrudan Cloudflare'e** ilerleme çubuğuyla gönder. Yüklenen video
`uploading` durumunda açılır; webhook hazır olunca incelemeye düşer.

**Studio.jsx** — Sanatçı panosu (giriş gerekli). Üreticinin bölümleri, durum rozetleri
(Yayında/İncelemede/Reddedildi…), toplam izlenme/izlenme saati ve aylık **hakediş**
dökümü (`creator_earnings`, `rpm_usd` ayarı). Her onaylı bölüme **"＋ Alt yazı"**:
dil seç + `.vtt` yükle → `add-caption` Edge Function VTT'yi Cloudflare'e gönderir,
mevcut alt yazı dilleri rozet olarak görünür. Veri `creator_stats()` rpc'sinden.

**AdminPanel.jsx** — Moderasyon (yalnız admin). **İnceleme kuyruğu**: her videonun
önizlemesi + AI ön-eleme risk rozeti (varsa) + Onayla&yayınla / Reddet. Onay videoyu
`approved`, taslak başlığı `published` yapar ve katalog önbelleğini tazeler. Ayrıca
**sponsor yönetimi** (ekle/durdur/sil), **yarışma yönetimi** (aç/kapat) ve **denetim
kaydı** (son durum değişimleri).

**AnalyticsPanel.jsx** — Analiz panosu (yalnız admin). Özet kartlar (toplam izlenme,
son 7 gün, tekil izleyici, tekrar izleme oranı), 14 günlük **günlük trend** sütun
grafiği, en çok izlenenler. Veri `analytics_*` security-definer rpc'lerinden.

### Modallar

| Dosya | Ne yapar |
|---|---|
| **Auth.jsx** | Giriş/kayıt modalı. E-posta doğrulama mesajı, giriş↔kayıt geçişi, ESC ile kapanır. |
| **Profile.jsx** | Profil düzenleme (görünen ad) + e-posta doğrulama durumu / yeniden gönderme. |
| **AyarlarModal.jsx** | ⚙ Ayarlar: dil seçici (5 dil, yerel adlarıyla) + alt yazı switch'i + alt yazı dili. Dili i18n'den, alt yazıyı ayarlar bağlamından okur/yazar. (Dosya adı `ayarlar.jsx` bağlamıyla Windows'ta çakışmasın diye `AyarlarModal`.) |

---

## 3. Veritabanı — `sql/`

Numaralı dosyalar **sırayla** çalıştırılır (`npm run db:push` bunları migration'a çevirip
uygular). Her tabloda RLS açıktır.

| Dosya | Ne kurar |
|---|---|
| **01_schema.sql** | Çekirdek şema: `profiles`, `titles`, `videos`, `watch_events` + RLS ilkeleri + yeni kullanıcıda otomatik profil tetikleyicisi + rol değişimini kilitleme. Herkese açık okuma yalnızca yayınlanmış/onaylı içerikte. |
| **02_admin_policies.sql** | `is_admin()` yardımcısı + adminlere inceleme/yayın erişimi veren RLS ilkeleri. |
| **03_analytics.sql** | `analytics_summary/daily/top_titles/rewatch` — security-definer + admin kontrollü analiz fonksiyonları. |
| **04_seed.sql** | Örnek veri (yalnızca geliştirme; üretime gitmez — `supabase/seed.sql`e ayrılır). |
| **05_retention.sql** | `my_list` (Listem) + izleme ilerlemesi güncelleme ilkesi + `creator_stats()`. |
| **06_notifications.sql** | `notifications` tablosu + video onaylanınca Listem'dekilere bildirim düşüren tetikleyici. |
| **07_revenue.sql** | `sponsors` (pre-roll) + `ad_events` + `app_settings` (`rpm_usd`) + `creator_earnings()`. |
| **08_discovery.sql** | Tam metin arama: `turkish` tsvector kolonu + GIN indeksi. |
| **09_audit.sql** | `audit_log` + video/başlık durum değişimlerini kaydeden tetikleyiciler. |
| **10_contest.sql** | `contests`, `contest_entries`, `contest_votes` + `contest_results()`. Süre/aktiflik kuralları RLS'te (biten yarışmada oy/katılım engelli). |
| **11_grants.sql** | Şema grant'ları (bulutta varsayılan; yerel/özel kurulumda şart). |
| **12_moderation.sql** | AI ön-eleme alanları: `videos.ai_risk / ai_ozet / ai_incelendi_at`. |
| **13_captions.sql** | Alt yazı: `videos.captions[]` + `creator_stats()` güncellemesi (cf_uid/captions döndürür). |

---

## 4. Edge Functions — `supabase/functions/`

Sunucusuz fonksiyonlar. Sırlar (Cloudflare token vb.) yalnız burada; istemciye asla konmaz.

| Fonksiyon | Ne yapar |
|---|---|
| **create-upload** | Kullanıcıyı ve başlık sahipliğini doğrular, Cloudflare'den **imzalı doğrudan yükleme URL'i** alır, `videos` kaydını `uploading` açar. |
| **stream-webhook** | Cloudflare "video hazır" webhook'u. HMAC imza doğrular, videoyu `in_review` yapar (ASLA doğrudan `approved` değil — yayın kararı admindedir). |
| **notify-new-content** | Zamanlanmış. Bildirim kuyruğunu kullanıcı başına gruplayıp Resend ile e-postalar (yalnız doğrulanmış adreslere). |
| **ai-screen** | Zamanlanmış. İnceleme kuyruğundaki videoların **metadata'sını** Claude'a (claude-opus-4-8, yapılandırılmış çıktı) değerlendirtir → `ai_risk/ai_ozet`. Karar yine adminde. |
| **add-caption** | Üreticinin `.vtt` alt yazısını doğrular, sahipliği kontrol eder, Cloudflare captions API'sine yükler, `videos.captions`'a dili ekler. |

---

## 5. Diğer parçalar

| Yol | Ne yapar |
|---|---|
| **functions/[[yol]].js** | Cloudflare Pages Function. Paylaşılan `?b=<id>` bağlantılarında başlığa özel **OG meta** (og:title/description/image) üretir — sosyal ağ kartları için. Test: `npm run og:test`. |
| **scripts/migrationlari-esitle.mjs** | `sql/` → `supabase/migrations/` + `seed.sql` üretimi (`npm run db:sync`). |
| **scripts/kontrol.mjs** | Canlıya çıkış kontrol listesi (`npm run kontrol`): eksik `.env`, CF kodu, migration, bağlantı. |
| **scripts/dil-kontrol.mjs** | Dil paketi denetimi (`npm run dil:kontrol`): 5 sözlüğün anahtar ağaçları eşit mi + koddaki her `s.x.y` kullanımı tüm dillerde var mı. |
| **scripts/og-testi.mjs** | OG prerender'ın yerel Supabase'e karşı bütünleşme testi. |
| **scripts/docker-baslat.cmd** | Bu makineye özel: eski unix-soket kalıntılarını temizleyip Docker Desktop'ı güvenle başlatır. |

---

## 6. Mobil — `mobil/` (Expo / React Native)

Web ile **aynı Supabase backend'i**, ayrı ince istemci.

| Dosya | Ne yapar |
|---|---|
| **App.js** | Tüm mobil ekranlar tek dosyada: Keşfet (hero + açıklamalı **dikey akış** + kategori filtresi + akıllı arama), Detay (bilgi + Listeme ekle + bölümler), **YouTube düzenli oynatıcı** (video üstte sabit, altında kaydırılabilir bilgi + bölüm listesi), giriş/kayıt modalı, ⚙ ayarlar modalı (dil + alt yazı). Girişli kullanıcıda "devam et" + "Listem" rafları. Ayarlar AsyncStorage'da kalıcı. |
| **api.js** | Veri katmanı: anonim okuma için hafif PostgREST `fetch`, kişisel/yazma işlemleri için supabase-js (oturum token'ını RLS'e geçirir). Kapak/iframe URL yardımcıları (CF kurulu değilse kapak üretmez). |
| **auth.js** | `signIn/signUp/signOut` + `useAuth()` (web örüntüsünün mobil sürümü). |
| **supabaseClient.js** | supabase-js istemcisi; oturum **AsyncStorage'da kalıcı** (uygulama kapanınca korunur). |
| **i18n.js** | Mobil dil sözlüğü (5 dil, düz yapı; erişim adı `d`). |
| **config.js** | Supabase URL + anon key + CF kodu. Telefonla yerel test için `127.0.0.1` yerine LAN IP yazılır. |

---

## 7. Performans ve önbellek stratejisi

- **Önbellekler (catalog.js):** Katalog (60 sn), başlık detayı, kişisel raflar (30 sn),
  yarışma (30 sn) TTL'li önbelleklenir. Sekmeler/görünümler arası gezinme ağa **yeniden
  istek atmaz**; yayın/oy/Listem gibi yazma işlemleri ilgili önbelleği `…Tazele()` ile
  boşaltır. (Ölçüm: yarışma sekmesi gezinmesi 16 istek → 0.)
- **Kod bölme:** Upload/Studio/AdminPanel/AnalyticsPanel `React.lazy` ile ayrı chunk —
  çoğu izleyicinin görmediği kod ilk bundle'a girmez.
- **Görseller:** Kapaklar lazy `<img>`, kırıkta baş-harf yedeğine düşer; CF kurulu
  değilken hiç kapak isteği üretilmez.
- **Bildirimler** yalnızca girişte + zil açılınca çekilir (her sekme geçişinde değil).
- **createRoot idempotent** (HMR-güvenli); StrictMode bilinçli kapalı (gerekçe main.jsx).

---

## 8. Güvenlik ilkeleri

- Her tabloda RLS açık; herkese açık okuma yalnız yayınlanmış/onaylı içerikte.
- Video kayıtlarını yalnız Edge Function (service role) açar; durum geçişleri
  webhook/admin'dedir — webhook asla doğrudan `approved` yapamaz.
- Rol yükseltme istemciden engellidir (tetikleyici); analiz/hakediş fonksiyonları
  `security definer` + yetki kontrolüyle çalışır.
- Sırlar yalnız Edge Function secrets'ta; istemciye asla konmaz. Cloudflare hesap kodu
  gizli değildir ve tek yerde (`config.js`) tutulur.
