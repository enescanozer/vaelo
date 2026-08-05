// art-screen — "Tablo" görselleri için Claude vision tabanlı içerik ön-elemesi.
// Zamanlanmış çalışır: değerlendirilmemiş (ai_incelendi_at boş), gösterilecek eserlerin
// GÖRSELİNİ Claude'a değerlendirtir ve risk işaretini art_pieces satırına yazar.
// Bu bir ÖN işarettir; kaldırma kararı her zaman moderatör/admindedir.
//
// Dağıtım:  npx supabase functions deploy art-screen
// Secret:   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (ai-screen ile aynı anahtar)
// Zamanlama: Dashboard → Edge Functions → art-screen → Schedule (örn. */10 * * * *)
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

// Yapılandırılmış çıktı şeması — model her zaman bu biçimde döner
const SEMA = {
  type: "object",
  properties: {
    risk: {
      type: "string",
      enum: ["low", "medium", "high"],
      description: "Overall policy-risk level suggested by the image",
    },
    summary: { type: "string", description: "One short sentence for the human moderator" },
    reasons: { type: "array", items: { type: "string" }, description: "Specific concerns, empty if none" },
  },
  required: ["risk", "summary", "reasons"],
  additionalProperties: false,
};

const SISTEM_ISTEMI = `You pre-screen AI-generated artwork images for Vaelo, a free
ad-supported platform showing only AI-made content. Assess the likelihood that the IMAGE
violates policy: sexual or explicit content, graphic violence or gore, hate symbols or
harassment, self-harm, illegal content, or realistic impersonation of real people or
protected franchises (copyright). Most submissions are benign creative art, and dark or
abstract THEMES alone are not violations. A human moderator makes the final call; your
output only helps prioritize the moderation queue.`;

const yanit = (govde: unknown, durum = 200) =>
  new Response(JSON.stringify(govde), { status: durum, headers: { "Content-Type": "application/json" } });

Deno.serve(async () => {
  try {
    const anahtar = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anahtar) {
      return yanit({ atlandi: "ANTHROPIC_API_KEY tanımlı değil", incelenen: 0 });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const servis = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Değerlendirilmemiş, gösterilecek eserler (çalıştırma başına en çok 5 — maliyet sınırı)
    const { data: bekleyen, error } = await servis
      .from("art_pieces")
      .select("id, image_path")
      .in("durum", ["aktif", "sergide"])
      .is("ai_incelendi_at", null)
      .order("created_at", { ascending: true })
      .limit(5);
    if (error) throw error;
    if (!bekleyen?.length) return yanit({ incelenen: 0 });

    const anthropic = new Anthropic({ apiKey: anahtar });
    let incelenen = 0;

    for (const eser of bekleyen) {
      // 'art' bucket herkese açık → Claude görseli URL'den çeker
      const gorselUrl = servis.storage.from("art").getPublicUrl(eser.image_path).data.publicUrl;

      let guncelleme: Record<string, unknown>;
      try {
        const cevap = await anthropic.messages.create({
          model: "claude-opus-4-8",
          max_tokens: 4096,
          thinking: { type: "adaptive" },
          system: SISTEM_ISTEMI,
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "url", url: gorselUrl } },
                { type: "text", text: "Assess this AI-generated artwork against the policy." },
              ],
            },
          ],
          output_config: { format: { type: "json_schema", schema: SEMA } },
        });

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
            ai_ozet: [sonuc.summary, ...(sonuc.reasons ?? [])].filter(Boolean).join(" · ").slice(0, 500),
            ai_incelendi_at: new Date().toISOString(),
          };
        }
      } catch (apiHata) {
        // Tek eser başarısız olsa da diğerleri işlensin; bu eser sonraki turda denenir
        console.error(`art-screen ${eser.id} değerlendirilemedi:`, apiHata);
        continue;
      }

      await servis.from("art_pieces").update(guncelleme).eq("id", eser.id);
      incelenen++;
    }

    return yanit({ incelenen });
  } catch (e) {
    console.error("art-screen beklenmedik hata:", e);
    return new Response("beklenmedik hata", { status: 500 });
  }
});
