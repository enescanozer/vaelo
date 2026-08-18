# Vaelo — Uygulama Haritası

> **Bu doküman 2026-08-18 itibarıyla kod tabanının denetimiyle oluşturulmuştur.** Her madde,
> hafızadan/varsayımdan değil, ilgili dosya/tablo/fonksiyon okunarak yazıldı ve kaynağı
> parantez içinde belirtildi. **Yeni bir özellik eklendiğinde veya önemli bir değişiklik
> yapıldığında bu dosya ELLE güncellenmelidir — otomatik güncellenmez.**
>
> Not: Depoda ayrıca `README.md` ve `KOD-REHBERI.md` mevcut; bu dosya bunlardan bağımsız,
> "ne var / ne yapıyor" sorusuna kod-kaynaklı tek referans olmayı hedefler.

Kimlik: Tamamen AI ile üretilmiş film/dizi + görsel için **her zaman ücretsiz** streaming platformu.
Reklam/sponsorlukla finanse; sanatçılar izlenmeyle kazanır. **Global**, UI varsayılanı İngilizce.
Prod: **watchvaelo.com** (Cloudflare Pages) · Supabase `xcrzycuikeoyzbozoayy` · CF Stream `p5urunciefhqg37e`.

---

## 1. Veritabanı Şeması (Supabase / Postgres)

Kaynak: `sql/01..39_*.sql` (numaralı; `npm run db:sync` → `supabase/migrations/`). Her tabloda **RLS açık**.
Yetki fonksiyonları: **`is_admin()`** (yalnız `admin`, sql/02) · **`is_moderator()`** (`admin`∪`moderator`, sql/18).
Rol hiyerarşisi: `viewer < creator < moderator < admin`.

### Çekirdek tablolar
| Tablo | Kaynak | Öz | Anahtar RLS |
|---|---|---|---|
| **profiles** | 01 (+31,33,34) | id(→auth.users), display_name, role, created_at; +bio/instagram/tiktok/youtube/twitter/website(31), referans_kaynagi(33), display_name_chosen(34) | Kendi okur/günceller; moderatör okur; admin rol atar. `profiles_nickname_uniq` (lower(display_name), seçilmişlerde tekil) |
| **titles** | 01 (+08,29,32) | id, creator_id, name, description, kind(film/dizi), genre, year, status(draft/published), published_at; +search_vec tsvector(08), haftalik(29), kurucu_icerigi(32) | Yayınlanmış herkese; üretici kendi taslağı; moderatör hepsi |
| **videos** | 01 (+12,13,30,39) | id, title_id, creator_id, name, season, episode, **cf_uid**(CF Stream), duration_seconds, status(uploading/processing/in_review/approved/rejected), published_at; +ai_risk/ai_ozet/ai_incelendi_at(12), captions[](13), icerik_tipi(ana/yapim,30), **is_deleted/deleted_at/deleted_by/delete_reason/purge_after/purged_at**(39) | Onaylı **ve silinmemiş** herkese; üretici kendininki (silinmemiş); moderatör (silinmemiş). İstemci insert/update YOK |
| **watch_events** | 01 (+05) | id, video_id, user_id(boş=anonim), seconds, created_at | Herkes yazar; kendi okur/günceller; admin okur |
| **my_list** | 05 | Kullanıcının kaydettiği başlıklar (Listem) | Yalnız kendi |
| **video_ratings** | 26 | video başına 1–10 halk oyu (kullanıcı+video tekil, upsert) | Kendi oyu; `video_puan_ozet()` özet |
| **notifications** | 06 (+15,20) | user_id, kind, title/video ref, emailed_at, +push_sent_at(20), art_week_id(15) | Kendi okur/günceller; tetikleyiciyle dolar |
| **audit_log** | 09 | actor, tablo, kayit, eylem, detay(jsonb), created_at | Yalnız **admin** okur; definer fn/trigger yazar |

### Gelir / sponsor / ayar
| Tablo | Kaynak | Öz |
|---|---|---|
| **sponsors** | 07 | Pre-roll sponsor kartları (aktif herkese; admin CRUD) |
| **ad_events** | 07 | Reklam gösterim/tıklama olayları (herkes yazar, admin okur) |
| **app_settings** | 07 | key/value (rpm_usd vb.; girişli okur, admin yazar) |
| **platform_config** | 25 | Platform modu (festival↔netflix) — **herkese** okunur (anon dahil) |
| **promo_banners** | 25 (+28) | Festival landing banner'ları; +starts_at/ends_at zamanlı pencere(28) |

### Yarışma (lansman taktiği)
| Tablo | Kaynak | Öz |
|---|---|---|
| **contests / contest_entries / contest_votes** | 10 | Yarışma + katılım + izleyici oyu (yarışma başına tek oy). `oy_gecerli()`, `contest_results()`. `yarisma_penceresi()`(21) görünürlük |

### "Tablo" — haftalık AI görsel yarışması (ayrı, tam bir özellik)
| Tablo | Kaynak | Öz |
|---|---|---|
| **art_weeks / art_pieces / art_votes** | 14 | Hafta döngüsü + gönderilen görseller + tur oyları. Storage **'art' bucket** (yalnız görsel, 10MB) |
| **art_reports** | 17 | İzleyici eser bildirimi; +`ai_risk/ai_ozet`(19) |
| RPC | 14,15,16 | `art_bu_hafta/art_oy_seti(ANONİM)/art_sergi/art_benim_eserim`, hafta kontrolü `art_sonraki_tur/art_sergiye_al`, cron `art_lifecycle_ilerlet/art_tur_uygula`, moderasyon `art_kaldir` |

### Topluluk (iki katman)
| Tablo | Kaynak | Öz |
|---|---|---|
| **forum_threads/forum_posts/forum_post_likes/forum_thread_follows/forum_reports** | 35 | Forum altyapısı (nested reply, spoiler, soft-delete). **İstemci insert YOK** → yazma yalnız `forum-post` Edge Function. Okuma RPC `forum_konular/forum_mesajlar`; moderasyon `forum_post_kaldir/thread_kaldir/thread_kilitle/rapor_kuyrugu/thread_yonetim` |
| **sohbet_mesajlari / sohbet_odalari** | 38 | **CANLI SOHBET** (Twitch-tarzı, forum thread yerine kullanılan aktif model). Oda `ep:<id>`/`title:<id>`, nickname denormalize, **Supabase Realtime**. Yazma yalnız `forum-post` action='sohbet'. `sohbet_mesaj_sil/kaldir`, `sohbet_oda_kilit` |
| **user_moderation_actions** | 36 | Forum kullanıcı yaptırımı (warning/mute/ban, expires_at). `aktif_yaptirim()` (forum-post ön-kontrol), `forum_yaptirim_uygula/gecmisi`, `forum_kullanici_ara` |

### Moderasyon & başvuru & push
| Tablo | Kaynak | Öz |
|---|---|---|
| **moderation_results** | 24 | Katmanlı moderasyon sinyalleri/kararı; view **moderation_tier_stats** |
| **creator_basvurulari** | 21 | Üretici başvuru+onay (`creator_onayla/reddet`, `creator_basvuru_listesi`) |
| **push_tokens** | 20 | Mobil cihaz Expo token'ı (yalnız kendi) |

### View'lar
- **uretici_kartlari** (31): `profiles` self-only RLS'i aşmadan, yalnız `creator/admin`'in **herkese-açık** kolonlarını (display_name, bio, sosyal) dışa açan güvenli görünüm (security_invoker=false). İzleyici bir üreticinin profilini bununla okur.
- **moderation_tier_stats** (24): moderasyon boru hattı özet görünümü.

### Öne çıkan trigger'lar
`profiles_rol_koruma` (rol yalnız yetkiliyle) · `on_auth_user_created`→`handle_new_user` (otomatik profil, 01/33) · `videos_bildirim`→`bildirim_uret` (onayda kuyruk, 06) · `videos_denetim`/`titles_denetim`→`durum_degisimini_kaydet` (audit, 09) · `art_weeks_bildirim` (15) · `moderation_results_touch` (24) · `video_ratings_touch` (26) · **`trg_video_onayinda_yayinla`** (video approved→title published, anlık yayın, 27) · `trg_kurucu_icerigi_koru` (kurucu etiketi yalnız admin, 32).

### Migration kronolojisi (sql/)
01 şema+RLS · 02 admin ilkeleri+`is_admin` · 03 analiz · 04 seed · 05 tutundurma(Listem/ilerleme/`creator_stats`) · 06 bildirim · 07 gelir(sponsor/reklam/ayar/hakediş) · 08 arama(tsvector) · 09 denetim · 10 yarışma · 11 grant'lar · 12 AI ön-eleme alanları · 13 alt yazı · 14 Tablo(görsel yarışması) · 15 Tablo bildirim · 16 Tablo cron · 17 Tablo moderasyon · 18 roller(moderator) · 19 Tablo AI ön-eleme · 20 push · 21 üretici başvuru · 22 demo seed · 23 demo CF uid · 24 moderasyon boru hattı · 25 platform modu+banner · 26 video puanlama · 27 anlık yayın · 28 zamanlı banner · 29 haftalık dizi · 30 BTS içerik · 31 üretici sosyal+`uretici_kartlari` · 32 kurucu etiketi · 33 referral · 34 nickname · 35 forum · 36 kullanıcı yaptırımı · 37 bağış(yalnız parametrik) · 38 canlı sohbet · **39 video silme (soft delete + storage purge + audit)**.

---

## 2. Edge Functions (`supabase/functions/`) — 15 fonksiyon

| Fonksiyon | Tetik | Ne yapar | Secrets | Yazar/okur |
|---|---|---|---|---|
| **create-upload** | HTTP (JWT) | CF Stream imzalı doğrudan yükleme URL'i + `videos`('uploading') açar | CF_ACCOUNT_ID, CF_API_TOKEN | videos(insert), titles(oku) |
| **stream-webhook** | CF webhook | Video hazır→`videos.status='in_review'` + Tier1 tetikler (asla direkt approved) | CF_WEBHOOK_SECRET | videos(update) |
| **create-upload/webhook** | — | (video sunucudan GEÇMEZ; istemci→CF direkt) | — | — |
| **moderate-tier1** | HTTP/orkestrasyon | Fly/Render compute'u çağırır, ham sinyal + kısa-devre kararı | COMPUTE_SERVICE_URL/TOKEN | moderation_results |
| **moderate-tier2** | Cron | Belirsizler için Claude Haiku 4.5 Batch (vision+prompt cache), eşikle final | ANTHROPIC_API_KEY | moderation_results, videos |
| **ai-screen** | Cron | in_review videoların **metadatasını** Claude'a ön-eletir → `videos.ai_risk/ai_ozet` | ANTHROPIC_API_KEY | videos |
| **art-screen** | Cron | Tablo **görsellerini** Claude vision ön-eletir → `art_pieces.ai_risk` | ANTHROPIC_API_KEY | art_pieces |
| **art-cron** | Cron | `art_lifecycle_ilerlet()` service_role ile (haftalık döngü, idempotent) | — | art_weeks/pieces |
| **add-caption** | HTTP (JWT) | Üretici WebVTT'yi CF captions API'ye yükler + `videos.captions` | CF_ACCOUNT_ID/TOKEN | videos |
| **generate-captions** | HTTP (JWT) | CF transkripsiyonu + Claude çeviri (zaman damgası korunur) → 5 dil track | CF_*, ANTHROPIC_API_KEY | videos |
| **notify-new-content** | Cron | `notifications`(emailed_at boş) → Resend e-posta | RESEND_API_KEY | notifications |
| **send-push** | Cron | `notifications`(push_sent_at boş) → Expo Push API | — | notifications, push_tokens |
| **set-nickname** | HTTP (JWT) | Nickname biçim+moderasyon(/text) → `profiles.display_name` (**fail-open**) | COMPUTE_SERVICE_* | profiles |
| **forum-post** | HTTP (JWT) | Forum+sohbet TEK yazma kapısı: mute/ban + **/text moderasyon FAIL-CLOSED** + insert. action: thread/reply/edit/**sohbet** | COMPUTE_SERVICE_* | forum_*/sohbet_mesajlari |
| **video-delete** | HTTP (JWT) | `DELETE /api/v1/videos/{id}` adaptörü: `video_sil` RPC (RBAC+soft delete+audit) çağırır, SQLSTATE→HTTP(404/403/400). **Henüz deploy edilmedi** | — | (RPC üzerinden) |
| **purge-videos** | Cron | Saklama süresi (30g) dolan soft-deleted videoların CF Stream assetini kalıcı siler + `purged_at`. **Henüz deploy edilmedi** | CF_ACCOUNT_ID/TOKEN | videos, audit_log |

---

## 3. Web Uygulaması (`src/`)

Kabuk **`App.jsx`**: üst nav (rol-bazlı sekmeler) + `sekme` state + tarayıcı geçmişi (pushState/popstate, `?sekme=`) + bildirim zili + giriş/profil/ayar/şifre modalları. Sekmeler: `kesfet, tablo, yarisma, uretici, yukle, studyo, panel, analiz`.

### Ekranlar
| Bileşen | Ekran | Veri kaynağı |
|---|---|---|
| **Viewer.jsx** | Keşfet: ana sayfa (hero+arama+raflar), başlık detayı → **doğrudan oynatıcı** (hero banner kaldırıldı), Image-4 düzeni (başlık→üretici satırı→açıklama→puan→Topluluk), mobil-özel düzen(<480), tarayıcı geri/ileri, `?b=` deep-link | catalog.js |
| **Forum.jsx** | Topluluk **canlı sohbeti** (drawer/bottom-sheet, realtime, spoiler blur) | catalog.js sohbet* |
| **Tablo.jsx** | Haftalık AI görsel yarışması: gönderim + ANONİM eleme(oy) + sergi(sahipli) | sanat.js |
| **Contest.jsx** | Yarışma: lider vitrini + oy payı + sıralama | catalog.js |
| **Upload.jsx** | Üretici yükleme (create-upload → CF direkt) | catalog.js |
| **Studio.jsx** | Sanatçı panosu: kendi içerikleri/durumları/izlenme, alt yazı (manuel + AI üret) | catalog.js |
| **CreatorBasvuru.jsx** | İzleyici "Üretici ol" başvurusu | catalog.js |
| **Auth / Profile / SifreYenile / TakmaAdKur / AyarlarModal** | Giriş-kayıt / profil+e-posta doğrulama / şifre / zorunlu nickname / ayarlar(dil+altyazı) | auth.js, ayarlar.jsx |

**Veri/altyapı**: `catalog.js` (katalog/arama/izlenme/Listem/forum/sohbet/video-sil helper), `sanat.js` (Tablo), `auth.js` (useAuth), `i18n.jsx`+`metinler.js` (dil), `theme.js` (token), `config.js` (CF_CODE), `supabaseClient.js`.

### Modlar (festival ↔ netflix — `platform_config`, sql/25)
- **festival**: toplama-fazı landing (promo banner + "Film gönder"/"Sanata bak" CTA + "Bu Hafta Yeni" rafı). Tam katalog/hero yerine landing gösterilir.
- **netflix**: tam katalog — hero + "Devam et"/"Listem"/"Bu Hafta Yeni" rafları + tip/tür filtresi + akıllı arama.

### Role göre görünürlük (App.jsx `sekmeGorunur`)
- **anon/viewer**: Keşfet + Tablo (Cuma eleme günü gizli) + Yarışma (yalnız aktif/bitiş+2hafta) + "Üretici ol".
- **creator**: +Yükle, +Stüdyo.
- **moderator**: +Panel (inceleme kuyruğu + Tablo/forum moderasyonu; gelir/analiz YOK).
- **admin**: +Analiz + Panel'in tüm bölümleri + rol atama.

### AdminPanel bölümleri (`src/AdminPanel.jsx`, 13 bölüm)
ModerasyonKuyrugu (video onay/red, AI risk rozeti) · PlatformModu (festival↔netflix) · PromoBannerlar (zamanlı) · Basvurular (üretici onay/red) · Roller (moderator/creator/viewer atama) · ReferansSayaci · ForumRaporlar · ForumThreadYonetim · ForumKullaniciModerasyon (warning/mute/ban) · BagisAyarlari (parametrik) · Sponsorlar (pre-roll CRUD) · Yarismalar (aç/yönet) · DenetimKaydi (audit_log). *(Gelir/analiz/yarışma/rol/bağış = admin; moderasyon kuyruğu+forum = moderatör.)*

---

## 4. Mobil Uygulaması (`mobil/` — Expo/React Native)

Alt navigasyon 5 sekme (`SEKME_TANIM`, mobil/App.js): **home, discover, upload, studio, profile**. Ekranlar: `Ana` (home/discover feed+akıllı arama), `MobilFestival` (festival landing — **arama kutusu dahil**), `Detay`, `Oynatici` (YouTube-düzen player), `Tablo`, `ProfilEkrani`. Veri: `mobil/api.js` (anonim okuma PostgREST + kişisel/yazma supabase-js), `auth.js`, `i18n.js` (erişim adı `d`).

### Mobilde VAR
İzleme (hero+dikey akış+kategori filtre) · **akıllı arama** (festival+netflix, son düzeltmeyle festival modunda da) · **Listem** + devam-et · **1–10 puanlama** · **alt yazı görüntüleme** · **Tablo** (gönderim expo-image-picker + anonim eleme + sergi + izleyici bildirimi) · giriş/çıkış · **push token kaydı** (expo-notifications → push_tokens) · dil/altyazı ayarları.

### Mobilde YOK (web-mobil kapsam farkı)
- **Topluluk (forum/canlı sohbet)** — yalnız web.
- **Yarışma (Contest) ekranı** — yalnız web.
- **Üretici başvurusu (CreatorBasvuru)** — yalnız web (mobilde onaylı üretici yükleyebilir).
- **AdminPanel / Analiz / moderasyon** — yalnız web.
- **Alt yazı ÜRETİMİ (AI/manuel)** — yalnız web Stüdyo (mobilde yalnız görüntüleme).
- **Profil (display_name/nickname) düzenleme** — yalnız web (mobil ProfilEkrani = dil+altyazı ayarı + giriş).
- **Tablo moderasyonu / hafta kontrolü** — yalnız web (mobilde yalnız izleyici bildirimi).

---

## 5. Kullanıcıya Görünen Özellikler (düz liste)

| # | Özellik | Rol / mod | Platform |
|---|---|---|---|
| 1 | Ücretsiz film/dizi izleme (CF Stream oynatıcı) | herkes | web+mobil |
| 2 | Akıllı arama (yazarken, ada göre sıralı) | herkes | web+mobil |
| 3 | Tip/tür filtresi (film/dizi + kategori çipleri) | herkes / netflix | web+mobil |
| 4 | "Bu Hafta Yeni" rafı | herkes | web+mobil |
| 5 | "Devam et" + "Listem" rafları | girişli | web+mobil |
| 6 | 1–10 halk oylaması (IMDb tarzı ortalama) | girişli | web+mobil |
| 7 | Video paylaş (`?b=` deep-link + OG meta) | herkes | web (mobil paylaşım kısıtlı) |
| 8 | **Topluluk canlı sohbeti** (bölüm/başlık, realtime, spoiler) | girişli yazar | **yalnız web** |
| 9 | **"Tablo" — haftalık AI görsel yarışması**: haftada 1 görsel gönder → **anonim tur-tur eleme (oy)** → son 50 **sergi** (sahipli, puanlanır). Kaza/kurtarma otomasyonu, bildirim, moderasyon | herkes oy; girişli gönderir | web+mobil |
| 10 | Yarışma (film/dizi, izleyici oyu, sıralama) | herkes oy | yalnız web |
| 11 | Üretici olma başvurusu → onay → Yükle/Stüdyo | viewer→creator | yalnız web başvuru |
| 12 | Video yükleme (doğrudan CF), alt yazı (manuel+AI çok-dilli) | creator | web (yükleme mobilde de) |
| 13 | Sanatçı panosu + aylık hakediş | creator | web (özet mobil) |
| 14 | Üretici profili (avatar+ad+bio+sosyal) video altında | herkes görür | web+mobil |
| 15 | Bildirimler (uygulama-içi zil + e-posta + mobil push) | girişli | web+mobil |
| 16 | Sponsor pre-roll (5sn) | herkes | web+mobil |
| 17 | 8 dilde arayüz + alt yazı tercihi | herkes | web+mobil |
| 18 | Admin/moderasyon (kuyruk, roller, sponsor, yarışma, forum, banner, denetim) | mod/admin | yalnız web |

> **Özellikle arananan "haftalık görsel/eleme/oylama" mekanizması VARDIR** = madde 9, "**Tablo**". Kaynak: `sql/14–19`, `src/Tablo.jsx`, `src/sanat.js`, `mobil/App.js` (Tablo ekranı), edge `art-cron`/`art-screen`.

---

## 6. Dış Servis Entegrasyonları

| Servis | Amaç | Secrets/env | Durum |
|---|---|---|---|
| **Cloudflare Stream** | Video depolama/transcode/HLS/CDN + thumbnail + alt yazı + AI transkripsiyon. Video sunucudan geçmez | CF_ACCOUNT_ID, CF_API_TOKEN, CF_WEBHOOK_SECRET; istemci `CF_CODE`=`p5urunciefhqg37e` | **Canlı** |
| **Cloudflare Pages** | Web barındırma (main→otomatik deploy) | — | **Canlı** (watchvaelo.com) |
| **Supabase** | Postgres+Auth+Edge+Storage('art')+Realtime | VITE_SUPABASE_* | **Canlı** (`xcrzycuikeoyzbozoayy`) |
| **moderation-service** (compute) | Tier1 kare çıkarma + NSFW/şiddet sınıflandırma + /text blocklist (Edge Function HTTP ile çağırır) | COMPUTE_SERVICE_TOKEN, PERSPECTIVE_API_KEY | **Render'da canlı** (`moderation-service/main.py`+`render.yaml`; başlangıçta Fly.io hedefliydi, karta gerek olmadığı için Render'a taşındı; vision importları lazy) |
| **Anthropic Claude** | ai-screen/art-screen (ön-eleme), moderate-tier2 (Haiku 4.5 vision batch), generate-captions (çeviri) | ANTHROPIC_API_KEY | Kod hazır; secret varsa aktif |
| **Resend** | Bildirim e-postaları (notify-new-content) | RESEND_API_KEY | Domain doğrulandı (SMTP) |
| **Expo Push** | Mobil push (send-push) | — (token gerekmez) | Kod hazır; uçtan uca EAS build+cihaz ister |
| **Codemagic → Appetize** | Mobil build/önizleme | — | Kurulu (mobil yayın hattı) |

---

## 7. i18n / Dil Desteği

- **Web**: 8 dil — **en(varsayılan) · ru · zh · ar(RTL) · tr · es · de · fr**. Sözlük `src/metinler.js` (SAF veri), sağlayıcı `src/i18n.jsx` (`useLang()`), denetim **`npm run dil:kontrol`** (**451 anahtar**, 8 dilde parite zorunlu). Tarih/sayı `s.locale`.
- **Mobil**: 8 dil, `mobil/i18n.js` (erişim adı `d`), aynı örüntü.
- Kural: yeni metin **sekiz dile birden** eklenir; sabit metin yazılmaz (CLAUDE.md madde 1).

---

## 8. Bilinen Eksikler / Ertelenmiş İşler

- **video-delete / purge-videos** (sql/39): kod hazır, **prod'a deploy EDİLMEDİ** (migration üretildi, `db push`+`functions deploy`+cron schedule bekliyor).
- **M5 — manuel klip/kesit aracı**: CF Stream'e bağlı, **ertelendi** (festival roadmap).
- **Mobil profil (display_name) editörü**: yok — yalnız web.
- **Mobil topluluk/sohbet + Yarışma + üretici başvuru**: yok — yalnız web.
- **Mobil push uçtan uca**: kod+veri modeli hazır; **EAS build + gerçek cihaz** ile teslim doğrulaması bekliyor (bu ortamda cihaz/emülatör yok).
- **Gerçek reklam ağı (VAST) + üretici ödeme (Stripe/Wise)**: sponsor kartı var; ödeme entegrasyonu yok.
- **Bağış/donation** (sql/37): **yalnız parametrik** — gerçek ödeme sağlayıcısı yok.
- **art-cron zamanlaması**: prod kararına göre `0 */2 * * *` planlanmalı (şimdilik manuel admin kontrolü de var).
- **AR (Arapça) RTL**: `dir=rtl` set ediliyor; ince düzen cilası + ZH/AR ana-dil kontrolü bekliyor.

---

## 9. Güncel Tutma
Bu dosya **elle** güncellenir. Öneri: her büyük özellikten sonra bu denetimi yeniden çalıştırıp
(sql/ + functions/ + src/ + mobil/ başlıklarını tarayarak) dosyayı tazele. Otomatik senkron YOKTUR.
