// moderate-tier1 — Katmanlı moderasyonun Tier 1 orkestrasyonu.
// TÜM yüklemelerde çalışır: compute servisini (Fly.io) çağırır, ham sinyalleri yazar ve
// KISA DEVRE kararını verir. Medya işleme BURADA DEĞİL — yalnız orkestrasyon.
//
// Çağrı: (a) yükleme tamamlanınca { video_id } ile, ya da (b) gövdesiz → moderation_results'ı
//   olmayan in_review videoları tarar (zamanlanmış yedek).
// Dağıtım: npx supabase functions deploy moderate-tier1
// Secret'lar: COMPUTE_SERVICE_URL, COMPUTE_SERVICE_TOKEN (+ SUPABASE_* otomatik)
import { createClient } from "npm:@supabase/supabase-js@2";

const COMPUTE_URL = Deno.env.get("COMPUTE_SERVICE_URL");
const COMPUTE_TOKEN = Deno.env.get("COMPUTE_SERVICE_TOKEN");

const yanit = (g: unknown, s = 200) =>
  new Response(JSON.stringify(g), { status: s, headers: { "Content-Type": "application/json" } });

// Kaba dil tahmini (titles'ta dil alanı yok) — TR'ye özgü harfler → tr. İleride gerçek tespit.
const dilTahmin = (metin: string) => (/[ğşıçöü]/i.test(metin) ? "tr" : "en");

// KISA DEVRE: 'rejected' | 'approved' | 'manual' | 'escalate'
function tier1Karar(sc: any, framesAvailable: boolean): string {
  const gorselMax = Math.max(sc.nudity ?? 0, sc.violence ?? 0);
  const hepsi = [sc.nudity, sc.violence, sc.hate_politics, sc.profanity, sc.toxicity].map(
    (x) => x ?? 0,
  );
  // Kesin yüksek sinyal → LLM'siz REJECTED
  if (gorselMax >= 0.9 || sc.keyword_hit === true) return "rejected";
  // Hepsi net düşük (<0.3) + blocklist temiz → LLM'siz APPROVED
  const temiz = hepsi.every((x) => x < 0.3) && sc.keyword_hit !== true;
  const trBelirsiz = sc.perspective_low_confidence === true; // TR düşük güven → otomatik onaylama
  if (temiz && !trBelirsiz) {
    // GÜVENLİK: kare yoksa (Stream entegre değil) görsel doğrulanamaz → otomatik ONAY YOK.
    // Admin izlesin (MANUAL_REVIEW). Stream bağlanınca frames_available=true → gerçek APPROVED.
    return framesAvailable ? "approved" : "manual";
  }
  return "escalate";
}

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
  const framesAvailable = sc.frames_available === true;

  // Compute başarısızsa hiç sinyal yok → admin incelesin
  const verdict = tier1 ? tier1Karar(sc, framesAvailable) : "manual";

  // verdict → final_action / needs_tier2 / status / videos.status
  let finalAction: string | null = null;
  let needsTier2 = false;
  let status = "complete";
  let videoStatus: string | null = null;

  if (verdict === "rejected") {
    finalAction = "REJECTED";
    videoStatus = "rejected";
  } else if (verdict === "approved") {
    finalAction = "APPROVED";
    videoStatus = "approved";
  } else if (verdict === "manual") {
    finalAction = "MANUAL_REVIEW"; // videos.status = in_review kalır (Panel kuyruğu)
  } else {
    // escalate → Tier 2 (cron); videos.status = in_review kalır
    needsTier2 = true;
    status = "pending";
  }

  await servis.from("moderation_results").upsert(
    {
      video_id: video.id,
      tier1_scores: sc,
      tier1_verdict: verdict === "manual" ? "escalate" : verdict, // 'manual'ı 'escalate' say
      needs_tier2: needsTier2,
      flagged_timestamps: flagged,
      final_action: finalAction,
      status,
      reasoning: tier1 ? null : "compute servisine ulaşılamadı → elle inceleme",
    },
    { onConflict: "video_id" },
  );

  // videos.status YALNIZCA nihai APPROVED/REJECTED'te değişir (spec). MANUAL_REVIEW/escalate → in_review kalır.
  if (videoStatus) {
    await servis.from("videos").update({ status: videoStatus }).eq("id", video.id);
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
      if (islenmis.has(v.id) && !videoId) continue; // yalnız açıkça istenirse yeniden işle
      const verdict = await birVideoIsle(servis, v);
      sonuc[verdict] = (sonuc[verdict] ?? 0) + 1;
    }
    return yanit({ islenen: sonuc });
  } catch (e) {
    console.error("moderate-tier1 hata:", e);
    return yanit({ hata: "Beklenmedik hata" }, 500);
  }
});
