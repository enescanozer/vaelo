// video-delete — "DELETE /api/v1/videos/{id}" eşleniği (Supabase Edge Function HTTP adaptörü).
// İnce bir katman: KULLANICININ JWT'siyle video_sil RPC'sini çağırır (tüm RBAC + soft delete + audit
// SQL tarafında, TEK yetki kaynağı) ve RPC'nin SQLSTATE'ini gerçek HTTP durum koduna eşler.
//   • başarı        → 200 { ok, video_id, purge_after }
//   • video yok      → 404 (P0002)
//   • yetkisiz       → 403 (42501)
//   • gerekçe yok    → 400 (22004)   (moderasyon başkasının içeriğini silerken zorunlu)
// STORAGE burada SİLİNMEZ → 30 gün saklama sonrası zamanlanmış 'purge-videos' temizler.
//
// Dağıtım: supabase functions deploy video-delete   (config.toml: verify_jwt = true)
// İstek: DELETE ya da POST /functions/v1/video-delete
//   gövde:  { "video_id": "<uuid>", "reason": "<opsiyonel>", "hemen": false }
//   ya da:  /functions/v1/video-delete?video_id=<uuid>&reason=<...>
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "DELETE, POST, OPTIONS",
  "Content-Type": "application/json",
};
const yanit = (g: unknown, s = 200) => new Response(JSON.stringify(g), { status: s, headers: cors });

// PostgREST/PostgreSQL SQLSTATE → HTTP durum kodu
function sqlstateToHttp(code?: string): number {
  switch (code) {
    case "P0002": return 404; // video bulunamadi
    case "42501": return 403; // yetkisiz
    case "22004": return 400; // gerekçe zorunlu
    case "22023": return 409; // geri alınamaz (restore senaryosu)
    default: return 400;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "DELETE" && req.method !== "POST") {
    return yanit({ hata: "yontem", kod: "yontem" }, 405);
  }
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    // Kullanıcı JWT'siyle istemci → RPC içinde auth.uid() gerçek kullanıcıdır (RBAC bu sayede çalışır)
    const istemci = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await istemci.auth.getUser();
    if (!user) return yanit({ hata: "giris", kod: "giris" }, 401);

    // video_id + reason: gövdeden ya da query'den
    const q = new URL(req.url).searchParams;
    const g = await req.json().catch(() => ({}));
    const videoId = String(g?.video_id ?? q.get("video_id") ?? "").trim();
    const reason = (g?.reason ?? q.get("reason") ?? null) as string | null;
    const hemen = !!(g?.hemen ?? (q.get("hemen") === "true"));
    if (!/^[0-9a-fA-F-]{36}$/.test(videoId)) return yanit({ hata: "video_id", kod: "bicim" }, 400);

    // Çekirdek: video_sil RPC (RBAC + soft delete + audit hepsi burada)
    const { data, error } = await istemci.rpc("video_sil", {
      p_video: videoId,
      p_reason: reason,
      p_hemen: hemen,
    });
    if (error) {
      const http = sqlstateToHttp(error.code);
      // Kullanıcıya SQL ayrıntısı sızdırma; kısa kod dön
      const kod = http === 404 ? "bulunamadi" : http === 403 ? "yetkisiz" : http === 400 ? "gerekce" : "hata";
      return yanit({ hata: kod, kod }, http);
    }
    return yanit(data ?? { ok: true }, 200);
  } catch (e) {
    console.error("video-delete beklenmedik hata:", e);
    return yanit({ hata: "sunucu", kod: "sunucu" }, 500);
  }
});
