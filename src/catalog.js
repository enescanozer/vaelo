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
  katalogOnbellek = (data ?? []).map(onayliBolumler).filter((b) => b.videos.length > 0);
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
  const { data } = await supabase
    .from("contests")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false })
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
    kapak: ilkBolum?.cf_uid ? thumbUrl(ilkBolum.cf_uid) : null,
  };
}

// Katalogdan rafları kurar: "yeni eklenenler" + tür bazlı raflar.
// Raf başlıkları dile bağlı olduğundan çağıran taraf adları verir.
export function buildRows(katalog, adlar = { yeni: "New releases", diger: "Other" }) {
  const raflar = [];
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
