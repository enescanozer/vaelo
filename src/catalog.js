// Veri katmanı: katalog okuma, arama, izlenme kaydı/ilerlemesi, Listem ve
// Cloudflare Stream URL yardımcıları. Tüm ekranlar veriye buradan erişir.
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { CF_CODE, CF_KURULU } from "./config";

const CF_TABAN = `https://customer-${CF_CODE}.cloudflarestream.com`;

// Cloudflare Stream URL'leri. Kapaklar: CF kurulu değilse null döner (bileşenler
// harf yedeğine düşer, ağa hiç istek çıkmaz). Oynatıcı URL'i kullanıcı eylemiyle
// açıldığı için her zaman üretilir.
export const hlsUrl = (uid) => `${CF_TABAN}/${uid}/manifest/video.m3u8`;

// Oynatıcı iframe URL'i. Seçenekler: baslangic (sn, "devam et"), altyaziDil
// (CF player'da o dildeki alt yazıyı varsayılan açar; caption yüklüyse CC düğmesi
// zaten otomatik gelir — bu yalnızca başlangıçta hangi dilin açılacağını seçer).
export const iframeUrl = (uid, { baslangic = 0, altyaziDil = "" } = {}) => {
  const p = new URLSearchParams();
  if (baslangic > 0) p.set("startTime", `${Math.floor(baslangic)}s`);
  if (altyaziDil) p.set("defaultTextTrack", altyaziDil);
  const sorgu = p.toString();
  return `${CF_TABAN}/${uid}/iframe${sorgu ? `?${sorgu}` : ""}`;
};
export const thumbUrl = (uid) =>
  CF_KURULU && uid ? `${CF_TABAN}/${uid}/thumbnails/thumbnail.jpg?time=2s&height=480` : null;

// Yalnızca onaylı bölümleri bırak (RLS zaten gizler; üretici kendi onaysızını
// görebildiği için vitrinde istemci tarafında da süzüyoruz)
const onayliBolumler = (baslik) => ({
  ...baslik,
  videos: (baslik.videos ?? []).filter((v) => v.status === "approved"),
});

// Katalog önbelleği: görünümler/sekmeler arası gidiş-gelişte yeniden indirme
// yapılmaz (algılanan hız). Yayın/onay işlemleri katalogTazele() ile boşaltır.
let katalogOnbellek = null;
let katalogZamani = 0;
const KATALOG_TTL_MS = 60_000;

// Başlık detayı önbelleği (id → kayıt) — detaya gir-çık ağa gitmez
const baslikOnbellek = new Map();

export function katalogTazele() {
  katalogOnbellek = null;
  baslikOnbellek.clear();
}

// Yayınlanmış başlıkları onaylı bölümleriyle getirir
export async function getCatalog() {
  if (katalogOnbellek && Date.now() - katalogZamani < KATALOG_TTL_MS) {
    return katalogOnbellek;
  }
  const { data, error } = await supabase
    .from("titles")
    .select("*, videos(*)")
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) throw error;
  // Ana feed'de yapım (BTS) videoları bölüm olarak sayılmaz (M3) — yalnız detayda çapraz bağlanır
  katalogOnbellek = (data ?? [])
    .map(onayliBolumler)
    .map((b) => ({ ...b, videos: b.videos.filter((v) => (v.icerik_tipi ?? "ana") !== "yapim") }))
    .filter((b) => b.videos.length > 0);
  katalogZamani = Date.now();
  return katalogOnbellek;
}

// Vitrin (hero) için en yeni yayınlanan başlık
export async function getHero() {
  const katalog = await getCatalog();
  return katalog[0] ?? null;
}

// Tek başlık + sezon/bölüm sırasına dizilmiş onaylı bölümleri (önbellekli)
export async function getTitle(id) {
  const onbellek = baslikOnbellek.get(id);
  if (onbellek && Date.now() - onbellek.zaman < KATALOG_TTL_MS) return onbellek.veri;
  const { data, error } = await supabase
    .from("titles")
    .select("*, videos(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  const baslik = onayliBolumler(data);
  // Ana bölümler ile yapım (BTS) videolarını ayır — Viewer ana listeyi + "Yapım Süreci"ni ayrı gösterir
  baslik.yapimlar = baslik.videos.filter((v) => (v.icerik_tipi ?? "ana") === "yapim");
  baslik.videos = baslik.videos.filter((v) => (v.icerik_tipi ?? "ana") !== "yapim");
  baslik.videos.sort(
    (a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0)
  );
  baslikOnbellek.set(id, { zaman: Date.now(), veri: baslik });
  return baslik;
}

// Yayınlanmış başlıklarda arama: önce tam metin (turkish tsvector, sql/08),
// sonuç yoksa ya da sütun henüz eklenmediyse ilike'a düşer.
export async function searchTitles(sorgu) {
  const guvenli = sorgu.replace(/[%,()]/g, " ").trim();
  if (!guvenli) return [];

  const { data: tam, error: tamHata } = await supabase
    .from("titles")
    .select("*, videos(*)")
    .eq("status", "published")
    .textSearch("search_vec", guvenli, { type: "websearch", config: "turkish" })
    .limit(24);
  if (!tamHata && tam?.length) {
    return tam.map(onayliBolumler).filter((b) => b.videos.length > 0);
  }

  const { data, error } = await supabase
    .from("titles")
    .select("*, videos(*)")
    .eq("status", "published")
    .or(
      `name.ilike.%${guvenli}%,description.ilike.%${guvenli}%,genre.ilike.%${guvenli}%`
    )
    .limit(24);
  if (error) throw error;
  return (data ?? []).map(onayliBolumler).filter((b) => b.videos.length > 0);
}

// İzlenme olayı açar. Girişli kullanıcıda olay id'si döner; oynatıcı bu id
// üzerinden gerçek izlenme süresini günceller. Anonimde yalnızca görüntülenme sayılır.
export async function logWatch(videoId, userId = null, seconds = 0) {
  if (userId) {
    const { data, error } = await supabase
      .from("watch_events")
      .insert({ video_id: videoId, user_id: userId, seconds })
      .select("id")
      .single();
    if (error) {
      console.warn("izlenme kaydedilemedi:", error.message);
      return null;
    }
    return data.id;
  }
  const { error } = await supabase
    .from("watch_events")
    .insert({ video_id: videoId, user_id: null, seconds });
  if (error) console.warn("izlenme kaydedilemedi:", error.message);
  return null;
}

// Oynatıcının bildirdiği gerçek izlenme süresi (RLS: yalnızca kendi olayı)
export async function updateWatchSeconds(olayId, seconds) {
  if (!olayId) return;
  const { error } = await supabase
    .from("watch_events")
    .update({ seconds })
    .eq("id", olayId);
  if (error) console.warn("izlenme süresi güncellenemedi:", error.message);
  else kisiselTazele(); // "devam et" rafı taze ilerlemeyi göstersin
}

// "İzlemeye devam et": kullanıcının son olaylarından, başlık başına en yenisi.
// 30 sn'den az ya da %95'ten fazla izlenenler listeye girmez.
export async function getContinueWatching(userId) {
  const { data, error } = await supabase
    .from("watch_events")
    .select("video_id, seconds, created_at, videos(*, titles(*))")
    .eq("user_id", userId)
    .gt("seconds", 30)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;

  const gorulen = new Set();
  const sonuc = [];
  for (const olay of data ?? []) {
    const video = olay.videos;
    const baslik = video?.titles;
    if (!video || !baslik) continue;
    if (video.status !== "approved" || baslik.status !== "published") continue;
    if (gorulen.has(baslik.id)) continue;
    gorulen.add(baslik.id);
    const sure = Number(video.duration_seconds) || 0;
    if (sure > 0 && Number(olay.seconds) >= sure * 0.95) continue; // bitmiş sayılır
    sonuc.push({ video, baslik, saniye: Number(olay.seconds) });
    if (sonuc.length >= 12) break;
  }
  return sonuc;
}

// ————— Kişisel raflar (tek çağrı + önbellek) —————
// Devam et + Listem + tür ağırlıkları ekranlar arası dönüşte yeniden çekilmez.
// Liste/izleme yazımları kisiselTazele() ile boşaltır.
let kisiselOnbellek = null; // { userId, zaman, veri }
const KISISEL_TTL_MS = 30_000;

export function kisiselTazele() {
  kisiselOnbellek = null;
}

export async function getKisiselRaflar(userId) {
  if (
    kisiselOnbellek &&
    kisiselOnbellek.userId === userId &&
    Date.now() - kisiselOnbellek.zaman < KISISEL_TTL_MS
  ) {
    return kisiselOnbellek.veri;
  }
  const [devam, listem, turler] = await Promise.all([
    getContinueWatching(userId).catch(() => []),
    getMyList(userId).catch(() => []),
    getWatchedGenres(userId).catch(() => []),
  ]);
  kisiselOnbellek = { userId, zaman: Date.now(), veri: { devam, listem, turler } };
  return kisiselOnbellek.veri;
}

// ————— Listem —————
export async function getMyList(userId) {
  const { data, error } = await supabase
    .from("my_list")
    .select("title_id, titles(*, videos(*))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .map((satir) => satir.titles)
    .filter((b) => b && b.status === "published")
    .map(onayliBolumler)
    .filter((b) => b.videos.length > 0);
}

export async function inMyList(userId, titleId) {
  const { data } = await supabase
    .from("my_list")
    .select("title_id")
    .eq("user_id", userId)
    .eq("title_id", titleId)
    .maybeSingle();
  return !!data;
}

export async function toggleMyList(userId, titleId, ekliMi) {
  kisiselTazele(); // Listem rafı bir sonraki görünümde güncel gelsin
  if (ekliMi) {
    return supabase.from("my_list").delete().eq("user_id", userId).eq("title_id", titleId);
  }
  return supabase.from("my_list").insert({ user_id: userId, title_id: titleId });
}

// ————— Bildirimler —————
export async function getNotifications(userId) {
  const { data, error } = await supabase
    .from("notifications")
    .select("*, titles(name), videos(name, season, episode)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

export async function markNotificationsRead(userId) {
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
}

// ————— Sponsor / reklam (pre-roll) —————
// Aktif sponsorlardan rastgele birini seçer; hiç yoksa null (pre-roll atlanır)
export async function getActiveSponsor() {
  const { data, error } = await supabase.from("sponsors").select("*").eq("active", true);
  if (error || !data?.length) return null;
  return data[Math.floor(Math.random() * data.length)];
}

export async function logAd(sponsorId, videoId, userId = null, kind = "impression") {
  const { error } = await supabase
    .from("ad_events")
    .insert({ sponsor_id: sponsorId, video_id: videoId, user_id: userId, kind });
  if (error) console.warn("reklam olayı kaydedilemedi:", error.message);
}

// ————— Öneri —————
// Kullanıcının son izlemelerinden tür ağırlıklarını çıkarır (en sevilen önce)
export async function getWatchedGenres(userId) {
  const { data, error } = await supabase
    .from("watch_events")
    .select("videos(titles(genre))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return [];
  const sayim = new Map();
  for (const olay of data ?? []) {
    const tur = olay.videos?.titles?.genre;
    if (tur) sayim.set(tur, (sayim.get(tur) ?? 0) + 1);
  }
  return [...sayim.entries()].sort((a, b) => b[1] - a[1]).map(([tur]) => tur);
}

// ————— Yarışma —————
export async function getActiveContest() {
  // Aktif yarışma VEYA bitişten sonra 14 gün (kazanan/ilk 10 gösterimi). Aktif önce gelir.
  const onDortGun = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data } = await supabase
    .from("contests")
    .select("*")
    .or(`active.eq.true,ends_at.gte.${onDortGun}`)
    .order("active", { ascending: false })
    .order("ends_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

// Yarışmaya katılan yayınlanmış başlıklar (onaylı bölümleriyle)
export async function getContestEntries(contestId) {
  const { data, error } = await supabase
    .from("contest_entries")
    .select("title_id, titles(*, videos(*))")
    .eq("contest_id", contestId);
  if (error) throw error;
  return (data ?? [])
    .map((satir) => satir.titles)
    .filter((b) => b && b.status === "published")
    .map(onayliBolumler)
    .filter((b) => b.videos.length > 0);
}

// Oy toplamları: Map(title_id → oy)
export async function getContestResults(contestId) {
  const { data, error } = await supabase.rpc("contest_results", { yarisma: contestId });
  if (error) return new Map();
  return new Map((data ?? []).map((satir) => [satir.title_id, Number(satir.oy)]));
}

export async function getMyVote(contestId, userId) {
  const { data } = await supabase
    .from("contest_votes")
    .select("title_id")
    .eq("contest_id", contestId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.title_id ?? null;
}

// Yarışma başına tek oy; tekrar oylamada mevcut oy güncellenir
export async function voteContest(contestId, userId, titleId) {
  return supabase
    .from("contest_votes")
    .upsert(
      { contest_id: contestId, user_id: userId, title_id: titleId },
      { onConflict: "contest_id,user_id" }
    );
}

export async function enterContest(contestId, titleId) {
  return supabase
    .from("contest_entries")
    .insert({ contest_id: contestId, title_id: titleId });
}

// Üreticinin yarışmaya katılabilecek (yayınlanmış) başlıkları
export async function getMyPublishedTitles(userId) {
  const { data } = await supabase
    .from("titles")
    .select("id, name")
    .eq("creator_id", userId)
    .eq("status", "published")
    .order("created_at", { ascending: false });
  return data ?? [];
}

// Yarışma ekranının tüm verisi TEK önbellekli çağrıda: sekmeye her girişte
// contest+entries+results+kişisel için 3-5 ayrı istek atılıyordu; artık 30 sn
// önbellek. Oy/katılım sonrası yarismaTazele() ile boşalır.
let yarismaOnbellek = null; // { userId, zaman, veri }
const YARISMA_TTL_MS = 30_000;

export function yarismaTazele() {
  yarismaOnbellek = null;
}

export async function getYarismaVerisi(userId) {
  if (
    yarismaOnbellek &&
    yarismaOnbellek.userId === (userId ?? null) &&
    Date.now() - yarismaOnbellek.zaman < YARISMA_TTL_MS
  ) {
    return yarismaOnbellek.veri;
  }
  const yarisma = await getActiveContest();
  let veri;
  if (!yarisma) {
    veri = { yarisma: null, girisler: [], oylar: new Map(), benimOyum: null, basliklarim: [] };
  } else {
    const [girisler, oylar, benimOyum, basliklarim] = await Promise.all([
      getContestEntries(yarisma.id),
      getContestResults(yarisma.id),
      userId ? getMyVote(yarisma.id, userId) : Promise.resolve(null),
      userId ? getMyPublishedTitles(userId) : Promise.resolve([]),
    ]);
    veri = { yarisma, girisler, oylar, benimOyum, basliklarim };
  }
  yarismaOnbellek = { userId: userId ?? null, zaman: Date.now(), veri };
  return veri;
}

// ————— Raflar —————
// Başlığı raf kartına indirger
export function toCard(baslik) {
  const ilkBolum = (baslik.videos ?? [])[0];
  return {
    id: baslik.id,
    ad: baslik.name,
    tur: baslik.genre,
    tip: baslik.kind,
    yil: baslik.year,
    haftalik: baslik.haftalik ?? false,
    kapak: ilkBolum?.cf_uid ? thumbUrl(ilkBolum.cf_uid) : null,
  };
}

// Başlığın en yeni onaylı bölümünün yayın zamanı (ms). "Bu Hafta Yeni" için.
const enYeniBolumZamani = (baslik) =>
  Math.max(
    0,
    ...(baslik.videos ?? []).map((v) => (v.published_at ? new Date(v.published_at).getTime() : 0)),
  );

// Katalogdan rafları kurar: "yeni eklenenler" + tür bazlı raflar.
// Raf başlıkları dile bağlı olduğundan çağıran taraf adları verir.
export function buildRows(katalog, adlar = { yeni: "New releases", diger: "Other" }) {
  const raflar = [];
  // "Bu Hafta Yeni": son 7 günde yeni onaylı bölüm alan başlıklar (haftalık dizi ritmini öne
  // çıkarır — eski bir dizi bu hafta bölüm bıraktıysa başa gelir). En yeni bölüm üstte.
  if (adlar.buHafta) {
    const birHaftaOnce = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const buHafta = katalog
      .filter((b) => enYeniBolumZamani(b) >= birHaftaOnce)
      .sort((a, b) => enYeniBolumZamani(b) - enYeniBolumZamani(a));
    if (buHafta.length) {
      raflar.push({ ad: adlar.buHafta, kartlar: buHafta.slice(0, 12).map(toCard) });
    }
  }
  if (katalog.length) {
    raflar.push({ ad: adlar.yeni, kartlar: katalog.slice(0, 12).map(toCard) });
  }
  const turler = new Map();
  for (const baslik of katalog) {
    const tur = baslik.genre || adlar.diger;
    if (!turler.has(tur)) turler.set(tur, []);
    turler.get(tur).push(baslik);
  }
  if (turler.size > 1) {
    for (const [tur, liste] of turler) {
      raflar.push({ ad: tur, kartlar: liste.map(toCard) });
    }
  }
  return raflar;
}

// Ana sayfa verisi: hero + ham katalog (raflar, dil bilindiği yerde buildRows ile kurulur)
export function useHomeData() {
  const [durum, setDurum] = useState({
    yukleniyor: true,
    hero: null,
    katalog: [],
    hata: null,
  });

  useEffect(() => {
    let aktif = true;
    getCatalog()
      .then((katalog) => {
        if (!aktif) return;
        setDurum({
          yukleniyor: false,
          hero: katalog[0] ?? null,
          katalog,
          hata: null,
        });
      })
      .catch((e) => {
        if (!aktif) return;
        setDurum({ yukleniyor: false, hero: null, katalog: [], hata: e.message });
      });
    return () => {
      aktif = false;
    };
  }, []);

  return durum;
}

// ————— Üretici (creator) başvurusu —————
// Kullanıcının kendi başvuru durumu: { durum, mesaj } | null
export async function getCreatorBasvurum(userId) {
  const { data } = await supabase
    .from("creator_basvurulari")
    .select("durum, mesaj")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}
// Başvur (yeni) ya da reddedilmişse yeniden dene
export async function creatorBasvur(userId, mesaj) {
  return supabase
    .from("creator_basvurulari")
    .upsert(
      { user_id: userId, mesaj: mesaj || null, durum: "beklemede", karar_at: null },
      { onConflict: "user_id" }
    );
}
// Yarışma sekmesi görünsün mü? (aktif yarışma VEYA bitişten sonra 14 gün)
export async function getYarismaGorunur() {
  const { data } = await supabase.rpc("yarisma_penceresi");
  return data === true;
}

// ————— Admin: üretici başvuruları —————
export async function getCreatorBasvurular() {
  const { data } = await supabase.rpc("creator_basvuru_listesi");
  return data ?? [];
}
// ————— Moderasyon kuyruğu (Panel) —————
// Elle inceleme (final_action=MANUAL_REVIEW) + Tier 2 bekleyenler (needs_tier2 + pending/
// processing = "İnceleniyor"). En eski önce. RLS: moderation_results yalnız is_moderator() okur.
export async function getModerasyonKuyrugu() {
  const { data, error } = await supabase
    .from("moderation_results")
    .select(
      "*, videos(id, title_id, cf_uid, name, season, episode, titles(name, kind, creator_id))"
    )
    .or("final_action.eq.MANUAL_REVIEW,and(needs_tier2.eq.true,status.in.(pending,processing))")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Kuyruktan karar: video approved/rejected + (onayda) taslak başlık published +
// moderation_results final_action/status. videos.status değişimi audit_log'u tetikler (kim/ne zaman).
export async function moderasyonKarar(mr, onay) {
  const simdi = new Date().toISOString();
  const video = mr.videos;
  if (onay) {
    const { error } = await supabase
      .from("videos").update({ status: "approved", published_at: simdi }).eq("id", video.id);
    if (error) return { error };
    await supabase
      .from("titles").update({ status: "published", published_at: simdi })
      .eq("id", video.title_id).eq("status", "draft");
    katalogTazele();
  } else {
    const { error } = await supabase.from("videos").update({ status: "rejected" }).eq("id", video.id);
    if (error) return { error };
  }
  await supabase
    .from("moderation_results")
    .update({ final_action: onay ? "APPROVED" : "REJECTED", status: "complete" })
    .eq("id", mr.id);
  return { error: null };
}

export async function creatorOnayla(userId) {
  return supabase.rpc("creator_onayla", { p_user: userId });
}
export async function creatorReddet(userId) {
  return supabase.rpc("creator_reddet", { p_user: userId });
}

// ————— Platform modu (festival ↔ netflix) + toplama-fazı promo banner —————
// Mod her ziyaretçiye (anon dahil) uygulanır. Katalog önbelleğiyle aynı TTL — ekstra
// yavaş round-trip yok. Varsayılan 'festival' (tablo/erişim yoksa da güvenli).
let modOnbellek = null;
let modZamani = 0;
export async function getPlatformMode() {
  if (modOnbellek && Date.now() - modZamani < KATALOG_TTL_MS) return modOnbellek;
  const { data } = await supabase.from("platform_config").select("mode").eq("id", 1).maybeSingle();
  modOnbellek = data?.mode ?? "festival";
  modZamani = Date.now();
  return modOnbellek;
}
export async function setPlatformMode(mode) {
  const r = await supabase.rpc("platform_mode_ayarla", { p_mode: mode });
  modOnbellek = null; // sonraki okumada taze
  return r;
}
// Landing için o an geçerli tek banner. Tarih penceresi (M4): aktif VE
// (starts_at boş/geçmiş) VE (ends_at boş/gelecek). Önceliği en yeni başlayan pencere alır
// → gelecekteki tarihli banner (ör. 5 Kasım) o gün gelince eskisini otomatik geçer.
// Admin CRUD için getPromoBanners (pencereden bağımsız, hepsini listeler).
export async function getPromoBanner() {
  const simdi = new Date().toISOString();
  const { data } = await supabase
    .from("promo_banners").select("*").eq("active", true)
    .or(`starts_at.is.null,starts_at.lte.${simdi}`)
    .or(`ends_at.is.null,ends_at.gt.${simdi}`)
    .order("starts_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1).maybeSingle();
  return data ?? null;
}
export async function getPromoBanners() {
  const { data } = await supabase
    .from("promo_banners").select("*").order("created_at", { ascending: false });
  return data ?? [];
}

// ————— Video halk oylaması (1–10) —————
// Aggregate (ortalama + oy_sayisi) anon RPC ile; kullanıcının kendi puanı girişliyse.
export async function getVideoPuan(videoId, userId = null) {
  const [ozet, kendi] = await Promise.all([
    supabase.rpc("video_puan_ozet", { p_video: videoId }),
    userId
      ? supabase
          .from("video_ratings").select("puan")
          .eq("video_id", videoId).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const o = ozet.data?.[0] ?? { ortalama: null, oy_sayisi: 0 };
  return {
    ortalama: o.ortalama != null ? Number(o.ortalama) : null,
    oySayisi: Number(o.oy_sayisi) || 0,
    benim: kendi.data?.puan ?? null,
  };
}
// Oy ver/değiştir (upsert — contest_votes örüntüsü). Giriş çağıran tarafta zorunlu kılınır.
export async function puanVer(videoId, userId, puan) {
  return supabase
    .from("video_ratings")
    .upsert({ video_id: videoId, user_id: userId, puan }, { onConflict: "video_id,user_id" });
}

// ————— Üretici herkese açık kartı (video detayı) —————
// uretici_kartlari görünümü yalnız whitelisted kolonları döndürür (RLS güvenli).
export async function getUreticiProfil(creatorId) {
  if (!creatorId) return null;
  const { data } = await supabase
    .from("uretici_kartlari").select("*").eq("id", creatorId).maybeSingle();
  return data ?? null;
}

// Sosyal medya girişini güvenli URL'e çevirir: tam URL ise http/https doğrular; kullanıcı adı
// (@ opsiyonel) ise platforma göre URL kurar. javascript:/data: gibi şemalar reddedilir → null.
export function sosyalUrl(platform, ham) {
  if (!ham) return null;
  const g = String(ham).trim();
  if (!g) return null;
  if (/^https?:\/\//i.test(g)) {
    try {
      const u = new URL(g);
      return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
    } catch {
      return null;
    }
  }
  const kad = g.replace(/^@+/, "").replace(/\s+/g, "");
  if (!kad) return null;
  switch (platform) {
    case "instagram": return `https://instagram.com/${kad}`;
    case "tiktok": return `https://tiktok.com/@${kad}`;
    case "youtube": return `https://youtube.com/@${kad}`;
    case "twitter": return `https://x.com/${kad}`;
    case "website":
      try { return new URL(`https://${kad}`).href; } catch { return null; }
    default: return null;
  }
}
