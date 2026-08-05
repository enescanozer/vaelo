// ai-screen — İnceleme kuyruğu için Claude tabanlı içerik ön-elemesi.
// Zamanlanmış çalışır: değerlendirilmemiş in_review videoların BAŞLIK METADATASINI
// (ad, açıklama, tür — video değil) Claude'a değerlendirtir ve risk işaretini
// videos satırına yazar. Bu bir ÖN işarettir; yayın kararı her zaman admindedir.
//
// Dağıtım:  npx supabase functions deploy ai-screen
// Secret:   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Zamanlama: Dashboard → Edge Functions → ai-screen → Schedule (örn. */10 * * * *)
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

// Yapılandırılmış çıktı şeması: model her zaman bu biçimde döner
const SEMA = {
  type: "object",
  properties: {
    risk: {
      type: "string",
      enum: ["low", "medium", "high"],
      description: "Overall policy-risk level suggested by the metadata",
    },
    summary: {
      type: "string",
      description: "One short sentence for the human moderator",
    },
    reasons: {
      type: "array",
      items: { type: "string" },
      description: "Specific concerns, empty if none",
    },
  },
  required: ["risk", "summary", "reasons"],
  additionalProperties: false,
};

const SISTEM_ISTEMI = `You pre-screen video metadata for Vaelo, a free ad-supported
streaming platform for fully AI-generated films and series. Assess the likelihood that
the content violates policy: graphic violence, sexual content, hate or harassment,
self-harm, illegal activity, or impersonation of real people/franchises (copyright).
You only see metadata, not the video itself — judge what the metadata suggests and stay
calibrated: most submissions are benign fiction, and dark THEMES alone are not violations.
A human moderator watches every video and makes the final call; your output only helps
them prioritize the queue.`;

const yanit = (govde: unknown, durum = 200) =>
  new Response(JSON.stringify(govde), {
    status: durum,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async () => {
  try {
    const anahtar = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anahtar) {
      // Anahtar tanımlı değilse sessizce atla — kuyruk elle incelenmeye devam eder
      return yanit({ atlandi: "ANTHROPIC_API_KEY tanımlı değil", incelenen: 0 });
    }

    const servis = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Değerlendirilmemiş inceleme kuyruğu (çalıştırma başına en çok 5 — maliyet sınırı)
    const { data: bekleyen, error } = await servis
      .from("videos")
      .select("id, name, season, episode, titles(name, description, genre, kind)")
      .eq("status", "in_review")
      .is("ai_incelendi_at", null)
      .order("created_at", { ascending: true })
      .limit(5);
    if (error) throw error;
    if (!bekleyen?.length) return yanit({ incelenen: 0 });

    const anthropic = new Anthropic({ apiKey: anahtar });
    let incelenen = 0;

    for (const video of bekleyen) {
      const baslik = video.titles as {
        name?: string;
        description?: string;
        genre?: string;
        kind?: string;
      } | null;

      const metadata = [
        `Title: ${baslik?.name ?? "(unknown)"}`,
        baslik?.genre ? `Genre: ${baslik.genre}` : null,
        `Format: ${baslik?.kind === "dizi" ? "series episode" : "film"}`,
        video.name ? `Episode name: ${video.name}` : null,
        baslik?.description ? `Description: ${baslik.description}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      let guncelleme: Record<string, unknown>;
      try {
        const cevap = await anthropic.messages.create({
          model: "claude-opus-4-8",
          max_tokens: 4096,
          thinking: { type: "adaptive" },
          system: SISTEM_ISTEMI,
          messages: [{ role: "user", content: metadata }],
          output_config: { format: { type: "json_schema", schema: SEMA } },
        });

        // Güvenlik reddi: içeriği okumadan önce stop_reason denetle
        if (cevap.stop_reason === "refusal") {
          guncelleme = {
            ai_risk: "high",
            ai_ozet: "Automatic screening declined to assess — review manually.",
            ai_incelendi_at: new Date().toISOString(),
          };
        } else {
          const metin = cevap.content.find((b) => b.type === "text");
          const sonuc = JSON.parse(metin && "text" in metin ? metin.text : "{}");
          guncelleme = {
            ai_risk: ["low", "medium", "high"].includes(sonuc.risk) ? sonuc.risk : null,
            ai_ozet: [sonuc.summary, ...(sonuc.reasons ?? [])]
              .filter(Boolean)
              .join(" · ")
              .slice(0, 500),
            ai_incelendi_at: new Date().toISOString(),
          };
        }
      } catch (apiHata) {
        // Tek video başarısız olsa da diğerleri işlensin; bu video sonraki turda denenir
        console.error(`ai-screen ${video.id} değerlendirilemedi:`, apiHata);
        continue;
      }

      await servis.from("videos").update(guncelleme).eq("id", video.id);
      incelenen++;
    }

    return yanit({ incelenen });
  } catch (e) {
    console.error("ai-screen beklenmedik hata:", e);
    return new Response("beklenmedik hata", { status: 500 });
  }
});
