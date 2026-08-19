// Veri katmanı: anonim okuma için doğrudan PostgREST (hafif), kişiye özel/yazma
// işlemleri için supabase-js (oturum token'ını RLS'e otomatik geçirir).
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
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
  // Yapım (BTS) videoları ana feed'de bölüm sayılmaz (M3)
  return veri
    .map(onayliBolumler)
    .map((b) => ({ ...b, videos: b.videos.filter((v) => (v.icerik_tipi ?? "ana") !== "yapim") }))
    .filter((b) => b.videos.length > 0);
}

// Platform modu (festival ↔ netflix) — anon okunur, kısa önbellek (ekstra round-trip yok)
let _modOnbellek = null;
let _modZaman = 0;
export async function getPlatformMode() {
  if (_modOnbellek && Date.now() - _modZaman < 60000) return _modOnbellek;
  try {
    const veri = await getir("platform_config?select=mode&id=eq.1");
    _modOnbellek = veri?.[0]?.mode ?? "festival";
  } catch {
    _modOnbellek = "festival"; // güvenli varsayılan
  }
  _modZaman = Date.now();
  return _modOnbellek;
}
// Festival landing'i için o an geçerli tek banner (M4 tarih penceresi: aktif VE
// starts_at boş/geçmiş VE ends_at boş/gelecek; en yeni başlayan pencere öncelikli).
export async function getPromoBanner() {
  try {
    const z = encodeURIComponent(new Date().toISOString());
    const veri = await getir(
      "promo_banners?select=*&active=eq.true" +
        `&and=(or(starts_at.is.null,starts_at.lte.${z}),or(ends_at.is.null,ends_at.gt.${z}))` +
        "&order=starts_at.desc.nullslast,created_at.desc&limit=1"
    );
    return veri?.[0] ?? null;
  } catch {
    return null;
  }
}

// ————— Video halk oylaması (1–10) —————
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
export async function puanVer(videoId, userId, puan) {
  return supabase
    .from("video_ratings")
    .upsert({ video_id: videoId, user_id: userId, puan }, { onConflict: "video_id,user_id" });
}

// Tek başlık + sıralı bölümler
export async function getTitle(id) {
  const veri = await getir(`titles?select=*,videos(*)&id=eq.${id}`);
  const baslik = onayliBolumler(veri[0] ?? {});
  // Ana bölümler ile yapım (BTS) videolarını ayır (M3)
  baslik.yapimlar = baslik.videos.filter((v) => (v.icerik_tipi ?? "ana") === "yapim");
  baslik.videos = baslik.videos.filter((v) => (v.icerik_tipi ?? "ana") !== "yapim");
  baslik.videos.sort(
    (a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0)
  );
  return baslik;
}

// Üretici herkese açık kartı (video detayı): ad + bio + sosyal. uretici_kartlari görünümü
// yalnız whitelisted kolonları döndürür (RLS güvenli).
export async function getUreticiProfil(creatorId) {
  if (!creatorId) return null;
  try {
    const veri = await getir(`uretici_kartlari?select=*&id=eq.${creatorId}&limit=1`);
    return veri?.[0] ?? null;
  } catch {
    return null;
  }
}

// Sosyal medya girişini güvenli URL'e çevirir: tam URL ise http/https doğrular; kullanıcı
// adı (@ opsiyonel) ise platforma göre URL kurar. Aksi halde null.
export function sosyalUrl(platform, ham) {
  if (!ham) return null;
  const g = String(ham).trim();
  if (!g) return null;
  if (/^https?:\/\//i.test(g)) return g;
  const kad = g.replace(/^@+/, "").replace(/\s+/g, "");
  if (!kad) return null;
  switch (platform) {
    case "instagram": return `https://instagram.com/${kad}`;
    case "tiktok": return `https://tiktok.com/@${kad}`;
    case "youtube": return `https://youtube.com/@${kad}`;
    case "twitter": return `https://x.com/${kad}`;
    case "website": return `https://${kad}`;
    default: return null;
  }
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

// ————— Push bildirimleri: cihaz token'ını kaydet (giriş sonrası) —————
// EAS proje kimliği/cihaz yoksa sessizce geçer; kurulunca kendiliğinden çalışır.
export async function kayitPushToken(userId) {
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return;
    const { data: token } = await Notifications.getExpoPushTokenAsync();
    if (!token) return;
    await supabase
      .from("push_tokens")
      .upsert({ user_id: userId, token, platform: Platform.OS }, { onConflict: "user_id,token" });
  } catch {
    /* cihaz/proje yoksa (Expo Go / emülatörsüz) sessiz geç */
  }
}

// ————— Tablo (haftalık AI görsel yarışması) —————
// Görseller Supabase Storage 'art' bucket'ında; anonim oylama seti ve sergi verisi
// RLS-güvenli rpc'lerden gelir (eleme sırasında sahip istemciye hiç gelmez).
export const artUrl = (yol) =>
  yol ? supabase.storage.from("art").getPublicUrl(yol).data.publicUrl : null;

// Bu haftanın durumu: { id, hafta_no, durum, tur, sergi_tarihi } | null
export async function getBuHafta() {
  const { data, error } = await supabase.rpc("art_bu_hafta");
  if (error) throw error;
  return data?.[0] ?? null;
}

// Sergi (cumartesi): 50 eser, oy sıralı, SAHİPLİ + sosyal linkler
export async function getSergi(weekId) {
  const { data, error } = await supabase.rpc("art_sergi", { p_week: weekId });
  if (error) throw error;
  return (data ?? []).map((e) => ({ ...e, url: artUrl(e.image_path) }));
}

// ANONİM oylama seti: sahip yok, kullanıcının bu turda oylamadığı ~N eser
export async function getOySeti(weekId, adet = 10) {
  const { data, error } = await supabase.rpc("art_oy_seti", { p_week: weekId, p_adet: adet });
  if (error) throw error;
  return (data ?? []).map((e) => ({ ...e, url: artUrl(e.image_path) }));
}

// Oy ver (eleme turu) / sergi puanı (tur=999). voter_id RLS ile auth.uid()'e kilitli.
export async function artOyVer(pieceId, userId, tur) {
  return supabase.from("art_votes").insert({ piece_id: pieceId, voter_id: userId, tur });
}

// İzleyici: eseri bildir (kişi başına eser başına tek — PK korur)
export async function artBildir(pieceId, userId, sebep = null) {
  return supabase.from("art_reports").insert({
    piece_id: pieceId,
    reporter_id: userId,
    sebep,
  });
}

// Kullanıcının bu haftaki eseri (gönderdi mi?)
export async function getBenimEserim(weekId) {
  const { data } = await supabase.rpc("art_benim_eserim", { p_week: weekId });
  const e = data?.[0];
  return e ? { ...e, url: artUrl(e.image_path) } : null;
}

// Eser gönder (haftada 1 — DB unique kısıtı korur). RN'de yerel uri → arrayBuffer → Storage.
export async function eserGonder(weekId, userId, varlik, aciklama, sosyal) {
  const uzanti = (varlik.uri.split(".").pop() || "jpg").toLowerCase().split("?")[0];
  const yol = `${userId}/${weekId}-${Date.now()}.${uzanti}`;
  const cevap = await fetch(varlik.uri);
  const veri = await cevap.arrayBuffer();
  const tur = varlik.mimeType || `image/${uzanti === "jpg" ? "jpeg" : uzanti}`;
  const { error: yukHata } = await supabase.storage.from("art").upload(yol, veri, {
    contentType: tur,
  });
  if (yukHata) throw yukHata;
  const { error } = await supabase.from("art_pieces").insert({
    week_id: weekId,
    creator_id: userId,
    image_path: yol,
    aciklama: aciklama || null,
    sosyal: sosyal ?? [],
  });
  if (error) throw error; // unique ihlali (haftada 2. eser) burada yakalanır
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

// ————— CANLI SOHBET (Topluluk) — web ile AYNI backend: sohbet_* RPC/action/tablo —————
// oda: 'ep:<video_id>' (bölüm) | 'title:<title_id>' (film/dizi geneli).
// Yazma YALNIZ forum-post 'sohbet'/'sohbet_duzenle' action'ından (moderasyon FAIL-CLOSED içeride).

// forum-post çağrısı (oturum token'ı otomatik geçer). Dönüş: { ok, mesaj } | { hata, kod }
async function forumYaz(body) {
  const { data, error } = await supabase.functions.invoke("forum-post", { body });
  if (error) {
    let kod = "sunucu";
    try {
      const g = await error.context?.json?.();
      if (g?.kod) kod = g.kod;
    } catch {
      /* gövde JSON değil */
    }
    return { hata: true, kod };
  }
  if (data?.hata) return { hata: true, kod: data.kod ?? "sunucu" };
  return { ok: true, ...data };
}

// İlk yükleme: mesaj + beğeni + reply/mention (sohbet_getir RPC — tek sorgu)
export async function sohbetGetir(oda, limit = 100) {
  const { data, error } = await supabase.rpc("sohbet_getir", { p_oda: oda, p_limit: limit });
  if (error) throw error;
  return data ?? [];
}
export async function sohbetOdaDurum(oda) {
  const { data } = await supabase.from("sohbet_odalari").select("locked").eq("oda", oda).maybeSingle();
  return !!data?.locked;
}
// Gönder / düzenle (yeni metin moderasyondan geçer). Sil: mevcut RPC.
export const sohbetGonder = (p) => forumYaz({ action: "sohbet", ...p });
export const sohbetDuzenle = (p) => forumYaz({ action: "sohbet_duzenle", ...p });
export const sohbetMesajSil = (id) => supabase.rpc("sohbet_mesaj_sil", { p_id: id });
// Like (RLS: yalnız kendi; duplicate PK ile engelli; sayım DB'den). oda: realtime filtre için.
export const sohbetBegen = (mesajId, userId, oda) =>
  supabase.from("sohbet_begeni").insert({ mesaj_id: mesajId, user_id: userId, oda });
export const sohbetBegenKaldir = (mesajId, userId) =>
  supabase.from("sohbet_begeni").delete().eq("mesaj_id", mesajId).eq("user_id", userId);
// Mention autocomplete (authenticated). → [{ id, display_name }]
export async function sohbetKullaniciAra(q) {
  const s = (q || "").trim();
  if (!s) return [];
  const { data } = await supabase.rpc("sohbet_kullanici_ara", { p_q: s, p_limit: 6 });
  return data ?? [];
}
// Realtime: mesaj (INSERT/UPDATE) ve beğeni (INSERT/DELETE). abone(...) kanal döner → sohbetAbonelikBirak ile kapat.
export function sohbetAbone(oda, onInsert, onUpdate, onDurum) {
  return supabase
    .channel(`sohbet:${oda}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "sohbet_mesajlari", filter: `oda=eq.${oda}` }, (p) => onInsert && onInsert(p.new))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sohbet_mesajlari", filter: `oda=eq.${oda}` }, (p) => onUpdate && onUpdate(p.new))
    .subscribe((status) => onDurum && onDurum(status)); // status: SUBSCRIBED | CHANNEL_ERROR | TIMED_OUT | CLOSED
}
export function sohbetBegeniAbone(oda, onDelta) {
  return supabase
    .channel(`sohbet_begeni:${oda}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "sohbet_begeni", filter: `oda=eq.${oda}` }, (p) => onDelta && onDelta(p.new.mesaj_id, p.new.user_id, "ekle"))
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "sohbet_begeni", filter: `oda=eq.${oda}` }, (p) => onDelta && onDelta(p.old.mesaj_id, p.old.user_id, "kaldir"))
    .subscribe();
}
export const sohbetAbonelikBirak = (kanal) => { if (kanal) supabase.removeChannel(kanal); };
