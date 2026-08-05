// "Tablo" (haftalık AI görsel yarışması) veri katmanı.
// Görseller Supabase Storage 'art' bucket'ında; anonim oylama seti ve sergi
// verisi RLS-güvenli rpc'lerden gelir (eleme sırasında sahip istemciye hiç gelmez).
import { supabase } from "./supabaseClient";

// Storage'daki yoldan herkese açık görsel URL'i
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
  const { data, error } = await supabase.rpc("art_oy_seti", {
    p_week: weekId,
    p_adet: adet,
  });
  if (error) throw error;
  return (data ?? []).map((e) => ({ ...e, url: artUrl(e.image_path) }));
}

// Oy ver (eleme turu) / sergi puanı (tur=999). voter_id RLS ile auth.uid()'e kilitli.
export async function artOyVer(pieceId, userId, tur) {
  return supabase.from("art_votes").insert({ piece_id: pieceId, voter_id: userId, tur });
}

// Kullanıcının bu haftaki eseri (gönderdi mi?)
export async function getBenimEserim(weekId) {
  const { data, error } = await supabase.rpc("art_benim_eserim", { p_week: weekId });
  if (error) return null;
  const e = data?.[0];
  return e ? { ...e, url: artUrl(e.image_path) } : null;
}

// Eser gönder (haftada 1 — DB unique kısıtı korur). Görseli Storage'a yükler.
export async function eserGonder(weekId, userId, dosya, aciklama, sosyal) {
  const uzanti = (dosya.name.split(".").pop() || "jpg").toLowerCase();
  const yol = `${userId}/${weekId}-${Date.now()}.${uzanti}`;
  const { error: yukHata } = await supabase.storage
    .from("art")
    .upload(yol, dosya, { contentType: dosya.type || "image/jpeg" });
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

// İzleyici: eseri bildir (kişi başına eser başına tek — PK korur)
export async function artBildir(pieceId, userId, sebep = null) {
  return supabase.from("art_reports").insert({
    piece_id: pieceId,
    reporter_id: userId,
    sebep,
  });
}

// Admin: eseri kaldır (oylama/sergiden çıkar)
export async function artKaldir(pieceId) {
  return supabase.rpc("art_kaldir", { p_piece: pieceId });
}

// Admin: verilen eserlerin bildirim sayıları -> { [pieceId]: adet }
// (RLS: admin tüm raporları görür; normal kullanıcı yalnız kendininkini → boş/az döner)
export async function getRaporSayilari(pieceIds) {
  if (!pieceIds?.length) return {};
  const { data } = await supabase
    .from("art_reports")
    .select("piece_id")
    .in("piece_id", pieceIds);
  const say = {};
  for (const r of data ?? []) say[r.piece_id] = (say[r.piece_id] ?? 0) + 1;
  return say;
}

// Moderatör: verilen eserlerin AI ön-eleme işareti -> { [pieceId]: { risk, ozet } }
// (RLS: moderator/admin art_pieces'i okur; başkası boş döner)
export async function getAiRiskleri(pieceIds) {
  if (!pieceIds?.length) return {};
  const { data } = await supabase
    .from("art_pieces")
    .select("id, ai_risk, ai_ozet")
    .in("id", pieceIds)
    .not("ai_risk", "is", null);
  const harita = {};
  for (const p of data ?? []) harita[p.id] = { risk: p.ai_risk, ozet: p.ai_ozet };
  return harita;
}

// Aktif haftadaki toplam aktif eser sayısı (admin paneli için)
export async function getAktifSayi(weekId) {
  const { count } = await supabase
    .from("art_pieces")
    .select("*", { count: "exact", head: true })
    .eq("week_id", weekId)
    .eq("durum", "aktif");
  return count ?? 0;
}

// ————— Admin: hafta yönetimi —————
export async function artHaftaBaslat(haftaNo) {
  return supabase.from("art_weeks").insert({ hafta_no: haftaNo, durum: "gonderim" });
}
export async function artElemeBaslat(weekId) {
  return supabase.from("art_weeks").update({ durum: "eleme", tur: 1 }).eq("id", weekId);
}
// Sergi biter → hafta 'bitti'; böylece yeni hafta başlatılabilir
export async function artHaftaBitir(weekId) {
  return supabase.from("art_weeks").update({ durum: "bitti" }).eq("id", weekId);
}
export async function artSonrakiTur(weekId, kalan) {
  return supabase.rpc("art_sonraki_tur", { p_week: weekId, p_kalan: kalan });
}
export async function artSergiyeAl(weekId) {
  return supabase.rpc("art_sergiye_al", { p_week: weekId, p_tarih: null });
}
