// moderate-tier1 — Katmanlı moderasyonun Tier 1 orkestrasyonu.
// TÜM yüklemelerde çalışır: compute servisini (Fly.io) çağırır, ham sinyalleri yazar ve
// KISA DEVRE kararını verir. Medya işleme BURADA DEĞİL — yalnız orkestrasyon.
//
// Çağrı: (a) yükleme tamamlanınca { video_id } ile, ya da (b) gövdesiz → moderation_results'ı
//   olmayan in_review videoları tarar (zamanlanmış yedek).
// Dağıtım: npx supabase functions deploy moderate-tier1
// Secret'lar: COMPUTE_SERVICE_URL, COMPUTE_SERVICE_TOKEN (+ SUPABASE_* otomatik)
import { createClient } from "npm:@supabase/supabase-js@2";
import { tier1Karar, verdiktenSonuc } from "./lib.ts";

const COMPUTE_URL = Deno.env.get("COMPUTE_SERVICE_URL");
const COMPUTE_TOKEN = Deno.env.get("COMPUTE_SERVICE_TOKEN");

const yanit = (g: unknown, s = 200) =>
  new Response(JSON.stringify(g), { status: s, headers: { "Content-Type": "application/json" } });

// Kaba dil tahmini (titles'ta dil alanı yok) — TR'ye özgü harfler → tr. İleride gerçek tespit.
const dilTahmin = (metin: string) => (/[ğşıçöü]/i.test(metin) ? "tr" : "en");

// tier1Karar + verdiktenSonuc → lib.ts (saf, test edilebilir).

async function birVideoIsle(servis: any, video: any) {
  const metin = `${video.titles?.name ?? ""} ${video.titles?.description ?? ""}`.trim();
  const lang = dilTahmin(metin);

  // Compute servisi (Fly.io) — Tier 1 ham sinyaller
  let tier1: any = null;
  try {
    const r = await fetch(`${COMPUTE_URL}/tier1`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${COMPUTE_TOKEN}` },
      body: JSON.stringify({
        video_id: video.id,
        cf_uid: video.cf_uid ?? null,
        duration_seconds: Number(video.duration_seconds) || 0,
        lang,
        text: { name: video.titles?.name ?? "", description: video.titles?.description ?? "" },
      }),
    });
    if (r.ok) tier1 = await r.json();
  } catch (_e) {
    tier1 = null; // compute erişilemedi → aşağıda güvenli tarafa (manual) düş
  }

  const sc = tier1?.tier1_scores ?? { frames_available: false };
  const flagged = tier1?.flagged_timestamps ?? [];

  // Compute başarısızsa hiç sinyal yok → admin incelesin ('manual')
  const verdict = tier1 ? tier1Karar(sc) : "manual";
  const sonuc = verdiktenSonuc(verdict);

  await servis.from("moderation_results").upsert(
    {
      video_id: video.id,
      tier1_scores: sc,
      tier1_verdict: sonuc.tier1Verdict,
      needs_tier2: sonuc.needsTier2,
      flagged_timestamps: flagged,
      final_action: sonuc.finalAction,
      status: sonuc.status,
      reasoning: tier1 ? null : "compute servisine ulaşılamadı → elle inceleme",
    },
    { onConflict: "video_id" },
  );

  // videos.status YALNIZCA nihai APPROVED/REJECTED'te değişir. MANUAL_REVIEW/escalate → in_review kalır.
  if (sonuc.videoStatus) {
    await servis.from("videos").update({ status: sonuc.videoStatus }).eq("id", video.id);
  }
  return verdict;
}

Deno.serve(async (req) => {
  try {
    const servis = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    if (!COMPUTE_URL || !COMPUTE_TOKEN) {
      return yanit({ hata: "COMPUTE_SERVICE_URL/TOKEN tanımlı değil" }, 500);
    }

    // Hedef: gövdedeki video_id, yoksa moderation_results'ı olmayan in_review videolar
    let videoId: string | null = null;
    try {
      videoId = (await req.json())?.video_id ?? null;
    } catch (_e) { /* gövdesiz çağrı */ }

    let q = servis
      .from("videos")
      .select("id, cf_uid, duration_seconds, status, titles(name, description)")
      .eq("status", "in_review");
    if (videoId) q = q.eq("id", videoId);
    const { data: videolar } = await q.limit(videoId ? 1 : 20);

    // moderation_results'ı zaten olanları atla (tekrar işleme)
    const idler = (videolar ?? []).map((v: any) => v.id);
    const { data: mevcut } = await servis
      .from("moderation_results").select("video_id").in("video_id", idler.length ? idler : ["-"]);
    const islenmis = new Set((mevcut ?? []).map((m: any) => m.video_id));

    const sonuc: Record<string, number> = {};
    for (const v of videolar ?? []) {
      // İDEMPOTENT: moderation_results zaten varsa yeniden işleme (webhook retry / tekrarlı
      // çağrı / tarama-webhook yarışı güvenli). unique(video_id) da tek satır garantiler.
      if (islenmis.has(v.id)) continue;
      const verdict = await birVideoIsle(servis, v);
      sonuc[verdict] = (sonuc[verdict] ?? 0) + 1;
    }
    return yanit({ islenen: sonuc });
  } catch (e) {
    console.error("moderate-tier1 hata:", e);
    return yanit({ hata: "Beklenmedik hata" }, 500);
  }
});
