// moderate-tier2 — Belirsiz (~%10-20) videolar için Tier 2. ZAMANLANMIŞ (cron) çalışır.
//   A) SUBMIT: needs_tier2 + status='pending' → işaretli kareleri çeker, TEK Claude Batch
//      olarak gönderir (Haiku 4.5, vision + prompt cache), status='processing' + batch_id.
//   B) POLL: status='processing' → batch bitmişse sonuçları parse eder, final_action'ı
//      4-kategori eşiğiyle hesaplar, videos.status'u yalnız APPROVED/REJECTED'te günceller.
//
// Neden Haiku 4.5: stack'te zaten Claude var (ANTHROPIC_API_KEY kurulu), güvenilir
// yapılandırılmış JSON, vision, prompt caching + Batch API (async, ~%50 ucuz; 1-2 dk gecikme
// kabul → UI'da "İnceleniyor"). Yeni sağlayıcı/sır gerektirmez.
//
// Eşikler (DEĞİŞTİRME): APPROVED <0.40 · MANUAL_REVIEW 0.40–0.85 · REJECTED ≥0.85 (4 kategorinin MAKS'ı).
// Dağıtım: npx supabase functions deploy moderate-tier2 ; Schedule: */2 * * * *
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const CF_CODE = Deno.env.get("CF_CODE"); // Stream hesap kodu — kare çekmek için
const MODEL = "claude-haiku-4-5-20251001";
const MAX_KARE = 6; // Tier 2'de video başına en çok kare (maliyet)

// 4-kategori şema — downstream ile drop-in uyumlu (nudity/violence/hate_politics/profanity 0..1)
const SEMA = {
  type: "object",
  properties: {
    nudity: { type: "number", description: "0..1 explicit sexual/nudity" },
    violence: { type: "number", description: "0..1 graphic violence/gore" },
    hate_politics: { type: "number", description: "0..1 hate/harassment/political extremism" },
    profanity: { type: "number", description: "0..1 strong profanity/slurs" },
    reasoning: { type: "string", description: "One short sentence for the moderator" },
  },
  required: ["nudity", "violence", "hate_politics", "profanity", "reasoning"],
  additionalProperties: false,
};

// Kanonik Tier 2 sistem istemi (frame-tabanlı 4-kategori). Prompt-cache'lenir (sabit kısım).
const SISTEM =
  `You are a content-safety reviewer for Vaelo, a free streaming platform for fully ` +
  `AI-generated films and series. You are given a few flagged still frames from one video ` +
  `plus its title and description. Score four categories from 0 to 1: nudity (explicit ` +
  `sexual content), violence (graphic gore), hate_politics (hate, harassment, identity ` +
  `attacks, or political extremism), profanity (strong profanity/slurs in the text). Be ` +
  `calibrated: fictional dark themes are not automatically violations; stylized/AI horror ` +
  `is common. Only score high when content is genuinely explicit or hateful. Return the ` +
  `JSON only.`;

const yanit = (g: unknown, s = 200) =>
  new Response(JSON.stringify(g), { status: s, headers: { "Content-Type": "application/json" } });

// İşaretli zaman damgalarındaki kareleri CF Stream thumbnail'inden çeker → base64 jpg.
async function kareleriCek(cfUid: string, flagged: any[]): Promise<string[]> {
  if (!CF_CODE || !cfUid) return []; // Stream entegre değil → kare yok
  const noktalar = (flagged ?? []).slice(0, MAX_KARE);
  const kareler: string[] = [];
  for (const f of noktalar) {
    const url =
      `https://customer-${CF_CODE}.cloudflarestream.com/${cfUid}/thumbnails/thumbnail.jpg` +
      `?time=${Math.floor(f.t ?? 0)}s&height=400`;
    try {
      const r = await fetch(url);
      if (r.ok) {
        const buf = new Uint8Array(await r.arrayBuffer());
        let bin = "";
        for (const b of buf) bin += String.fromCharCode(b);
        kareler.push(btoa(bin));
      }
    } catch (_e) { /* atla */ }
  }
  return kareler;
}

function finalEylem(sc: any): string {
  const maks = Math.max(sc.nudity ?? 0, sc.violence ?? 0, sc.hate_politics ?? 0, sc.profanity ?? 0);
  if (maks >= 0.85) return "REJECTED";
  if (maks >= 0.4) return "MANUAL_REVIEW";
  return "APPROVED";
}

async function submitAsamasi(servis: any, anthropic: Anthropic) {
  const { data: bekleyen } = await servis
    .from("moderation_results")
    .select("id, video_id, flagged_timestamps, tier1_scores, videos(cf_uid, titles(name, description))")
    .eq("needs_tier2", true).eq("status", "pending").limit(50);
  if (!bekleyen?.length) return { gonderilen: 0, manuel: 0 };

  const istekler: any[] = [];
  let manuel = 0;
  for (const r of bekleyen) {
    const cfUid = r.videos?.cf_uid;
    const kareler = await kareleriCek(cfUid, r.flagged_timestamps);
    if (kareler.length === 0) {
      // Stream yok / kare çekilemedi → Tier 2 görüntü göremez → admin incelesin (stub).
      await servis.from("moderation_results").update({
        needs_tier2: false, final_action: "MANUAL_REVIEW", status: "complete",
        reasoning: "Kare kaynağı yok (Stream entegre değil) → elle inceleme",
      }).eq("id", r.id);
      manuel++;
      continue;
    }
    const icerik: any[] = kareler.map((b64) => ({
      type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 },
    }));
    icerik.push({
      type: "text",
      text: `Title: ${r.videos?.titles?.name ?? ""}\nDescription: ${r.videos?.titles?.description ?? ""}\n` +
        `Tier 1 signals: ${JSON.stringify(r.tier1_scores ?? {})}`,
    });
    istekler.push({
      custom_id: r.id,
      params: {
        model: MODEL,
        max_tokens: 1024,
        system: [{ type: "text", text: SISTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: icerik }],
        output_config: { format: { type: "json_schema", schema: SEMA } },
      },
    });
  }
  if (istekler.length === 0) return { gonderilen: 0, manuel };

  const batch = await anthropic.messages.batches.create({ requests: istekler });
  await servis.from("moderation_results")
    .update({ status: "processing", batch_id: batch.id })
    .in("id", istekler.map((i) => i.custom_id));
  return { gonderilen: istekler.length, manuel, batch_id: batch.id };
}

async function pollAsamasi(servis: any, anthropic: Anthropic) {
  const { data: islemde } = await servis
    .from("moderation_results").select("batch_id").eq("status", "processing").not("batch_id", "is", null);
  const batchIdler = [...new Set((islemde ?? []).map((r: any) => r.batch_id))];
  let tamamlanan = 0;

  for (const bid of batchIdler) {
    const b = await anthropic.messages.batches.retrieve(bid as string);
    if (b.processing_status !== "ended") continue;
    const sonuclar = await anthropic.messages.batches.results(bid as string);
    for await (const giris of sonuclar) {
      const id = giris.custom_id;
      if (giris.result?.type !== "succeeded") {
        await servis.from("moderation_results").update({
          status: "complete", final_action: "MANUAL_REVIEW",
          reasoning: `Tier 2 başarısız (${giris.result?.type}) → elle inceleme`,
        }).eq("id", id);
        continue;
      }
      const metin = giris.result.message.content.find((c: any) => c.type === "text");
      let sc: any = {};
      try { sc = JSON.parse(metin?.text ?? "{}"); } catch (_e) { sc = {}; }
      const action = finalEylem(sc);

      await servis.from("moderation_results").update({
        tier2_scores: { nudity: sc.nudity, violence: sc.violence, hate_politics: sc.hate_politics, profanity: sc.profanity },
        final_action: action, reasoning: sc.reasoning ?? null, status: "complete",
      }).eq("id", id);

      // videos.status yalnız nihai APPROVED/REJECTED'te; MANUAL_REVIEW → in_review kalır (Panel)
      const { data: mr } = await servis.from("moderation_results").select("video_id").eq("id", id).single();
      if (mr && (action === "APPROVED" || action === "REJECTED")) {
        await servis.from("videos")
          .update({ status: action === "APPROVED" ? "approved" : "rejected" })
          .eq("id", mr.video_id);
      }
      tamamlanan++;
    }
  }
  return { tamamlanan };
}

Deno.serve(async () => {
  try {
    const anahtar = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anahtar) return yanit({ atlandi: "ANTHROPIC_API_KEY yok" });
    const servis = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const anthropic = new Anthropic({ apiKey: anahtar });

    const poll = await pollAsamasi(servis, anthropic);   // önce biten batch'leri kapat
    const submit = await submitAsamasi(servis, anthropic); // sonra yeni bekleyenleri gönder
    return yanit({ poll, submit });
  } catch (e) {
    console.error("moderate-tier2 hata:", e);
    return yanit({ hata: "Beklenmedik hata" }, 500);
  }
});
