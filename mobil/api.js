// Veri katmanı: anonim okuma için doğrudan PostgREST (hafif), kişiye özel/yazma
// işlemleri için supabase-js (oturum token'ını RLS'e otomatik geçirir).
import { SUPABASE_URL, SUPABASE_ANON_KEY, CF_CODE } from "./config";
import { supabase } from "./supabaseClient";

const CF_TABAN = `https://customer-${CF_CODE}.cloudflarestream.com`;
// Gerçek CF kodu girilmeden kapak URL'i üretilmez (askıda kalan istekler yavaşlatır)
const CF_KURULU = !CF_CODE.startsWith("CF_");
export const thumbUrl = (uid) =>
  CF_KURULU && uid ? `${CF_TABAN}/${uid}/thumbnails/thumbnail.jpg?time=2s&height=480` : null;
export const iframeUrl = (uid, altyaziDil = "") =>
  altyaziDil
    ? `${CF_TABAN}/${uid}/iframe?defaultTextTrack=${altyaziDil}`
    : `${CF_TABAN}/${uid}/iframe`;

const basliklar = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
};

async function getir(yol) {
  const cevap = await fetch(`${SUPABASE_URL}/rest/v1/${yol}`, { headers: basliklar });
  if (!cevap.ok) throw new Error(`Sunucu hatası (${cevap.status})`);
  return cevap.json();
}

// Yalnızca onaylı bölümleri bırak (web istemcisiyle aynı süzme)
const onayliBolumler = (baslik) => ({
  ...baslik,
  videos: (baslik.videos ?? []).filter((v) => v.status === "approved"),
});

// Yayınlanmış katalog (en yeni önce)
export async function getCatalog() {
  const veri = await getir(
    "titles?select=*,videos(*)&status=eq.published&order=published_at.desc"
  );
  return veri.map(onayliBolumler).filter((b) => b.videos.length > 0);
}

// Tek başlık + sıralı bölümler
export async function getTitle(id) {
  const veri = await getir(`titles?select=*,videos(*)&id=eq.${id}`);
  const baslik = onayliBolumler(veri[0] ?? {});
  baslik.videos.sort(
    (a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0)
  );
  return baslik;
}

// Basit arama (ad/açıklama/tür)
export async function searchTitles(sorgu) {
  const guvenli = encodeURIComponent(`%${sorgu.replace(/[%,()]/g, " ").trim()}%`);
  const veri = await getir(
    `titles?select=*,videos(*)&status=eq.published&or=(name.ilike.${guvenli},description.ilike.${guvenli},genre.ilike.${guvenli})&limit=24`
  );
  return veri.map(onayliBolumler).filter((b) => b.videos.length > 0);
}

// İzlenme kaydı: girişli kullanıcıda user_id ile (devam et için), anonimde boş.
export async function logWatch(videoId, userId = null) {
  try {
    await supabase.from("watch_events").insert({
      video_id: videoId,
      user_id: userId,
      seconds: 0,
    });
  } catch {
    /* izlenme kaydı düşmezse akışı bozma */
  }
}

// ————— Listem (giriş gerekli; RLS: user_id = auth.uid()) —————
export async function getMyList(userId) {
  const { data } = await supabase
    .from("my_list")
    .select("title_id, titles(*, videos(*))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
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
  if (ekliMi) {
    return supabase.from("my_list").delete().eq("user_id", userId).eq("title_id", titleId);
  }
  return supabase.from("my_list").insert({ user_id: userId, title_id: titleId });
}

// ————— İzlemeye devam et: son olaylardan başlık başına en yenisi —————
export async function getContinueWatching(userId) {
  const { data } = await supabase
    .from("watch_events")
    .select("video_id, seconds, created_at, videos(*, titles(*))")
    .eq("user_id", userId)
    .gt("seconds", 30)
    .order("created_at", { ascending: false })
    .limit(60);

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
    if (sure > 0 && Number(olay.seconds) >= sure * 0.95) continue; // bitmiş
    sonuc.push({ video, baslik, saniye: Number(olay.seconds) });
    if (sonuc.length >= 12) break;
  }
  return sonuc;
}
