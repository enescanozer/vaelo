// purge-videos — ZAMANLANMIŞ STORAGE TEMİZLİK WORKER'I (Cron).
// Soft-deleted (is_deleted=true) ve saklama süresi dolan (purge_after <= now, purged_at boş) videoların
// depolama assetlerini Cloudflare Stream'den KALICI siler. CF Stream, tek DELETE ile bir cf_uid'e ait
// TÜM türevleri (orijinal video + thumbnail + HLS/DASH segmentleri) kaldırır → ayrı segment temizliği YOK.
// Silinince DB satırı TOMBSTONE olarak KALIR (purged_at damgalanır) → deleted_by/reason/audit korunur.
//
// Video/Cloudflare player koduna DOKUNMAZ; yalnız yayından kaldırılmış (RLS ile zaten gizli) assetleri temizler.
// Dağıtım: supabase functions deploy purge-videos
// Zamanlama: Dashboard → Edge Functions → purge-videos → Schedule, önerilen: 0 * * * *  (saatlik)
// Secret'lar: CF_ACCOUNT_ID, CF_API_TOKEN (create-upload ile AYNI). Yoksa güvenli çıkar (hiçbir şey silmez).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Content-Type": "application/json" };
const yanit = (g: unknown, s = 200) => new Response(JSON.stringify(g), { status: s, headers: cors });

const CF_ACCOUNT = Deno.env.get("CF_ACCOUNT_ID");
const CF_TOKEN = Deno.env.get("CF_API_TOKEN");
const PARTI = 50; // tur başına üst sınır (edge fonksiyon süresi + CF hız limiti güvenli)

// Cloudflare Stream assetini sil. 200 (silindi) veya 404 (zaten yok) → başarı; diğer → başarısız.
async function cfStreamSil(uid: string): Promise<{ ok: boolean; durum: number }> {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/stream/${uid}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${CF_TOKEN}` } }
  );
  if (r.status === 404) return { ok: true, durum: 404 };       // zaten temizlenmiş
  if (r.ok) return { ok: true, durum: r.status };
  return { ok: false, durum: r.status };
}

Deno.serve(async (_req) => {
  try {
    if (!CF_ACCOUNT || !CF_TOKEN) {
      // Yapılandırılmamış → güvenli no-op (yanlışlıkla veri kaybı yok)
      return yanit({ ok: true, atlandi: "cf_secret_yok", temizlenen: 0 });
    }
    const url = Deno.env.get("SUPABASE_URL")!;
    const servis = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Saklama süresi dolmuş, henüz temizlenmemiş soft-deleted videolar
    const { data: bekleyen, error } = await servis
      .from("videos")
      .select("id, cf_uid")
      .eq("is_deleted", true)
      .is("purged_at", null)
      .lte("purge_after", new Date().toISOString())
      .limit(PARTI);
    if (error) {
      console.error("purge sorgu hatasi:", error.message);
      return yanit({ hata: "sorgu" }, 500);
    }

    let temizlenen = 0;
    const hatalar: string[] = [];
    for (const v of bekleyen ?? []) {
      // cf_uid yoksa (ör. yükleme tamamlanmadan silinmiş) doğrudan tombstone'la
      const sonuc = v.cf_uid ? await cfStreamSil(v.cf_uid) : { ok: true, durum: 0 };
      if (!sonuc.ok) {
        hatalar.push(`${v.id}:cf${sonuc.durum}`);
        continue; // sonraki turda yeniden denenir (purged_at boş kalır)
      }
      const { error: updHata } = await servis
        .from("videos")
        .update({ purged_at: new Date().toISOString() })
        .eq("id", v.id);
      if (updHata) { hatalar.push(`${v.id}:db`); continue; }

      // Denetim izi: storage kalıcı silindi
      await servis.from("audit_log").insert({
        actor: null, // otomatik/servis işlemi
        tablo: "videos",
        kayit: v.id,
        eylem: "videos_purged",
        detay: { cf_uid: v.cf_uid, cf_durum: sonuc.durum },
      });
      temizlenen++;
    }

    return yanit({ ok: true, aday: (bekleyen ?? []).length, temizlenen, hatalar });
  } catch (e) {
    console.error("purge-videos beklenmedik hata:", e);
    return yanit({ hata: "sunucu" }, 500);
  }
});
