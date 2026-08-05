// generate-captions — Bir bölüme AI ile ÇOK DİLLİ, SENKRON alt yazı üretir.
//   1) Cloudflare Stream AI transkripsiyonu ile konuşulan dilin VTT'sini üretir (senkron).
//   2) O VTT'yi cue'lara ayırır; YALNIZ METNİ Claude'a çevirtir, zaman damgalarına DOKUNMAZ.
//   3) Orijinal damgalarla birleştirip her hedef dili CF captions API'sine yükler.
// Böylece tüm diller birebir aynı zaman damgalarını paylaşır → senkron garanti.
//
// Dağıtım:  supabase functions deploy generate-captions
// Secret'lar: CF_ACCOUNT_ID, CF_API_TOKEN (add-caption ile aynı) + ANTHROPIC_API_KEY
//
// Kullanım (Stüdyo'dan): { video_id, kaynak_dil } — kaynak_dil = videoda konuşulan dil.
//   İlk çağrı transkripsiyonu başlatır (asenkron) → { durum: "uretiliyor" }.
//   Birkaç dk sonra tekrar çağır → kaynak hazırsa çevirip yükler → { durum: "tamam" }.
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const HEDEF_DILLER = ["en", "ru", "zh", "ar", "tr", "es", "de", "fr"]; // desteklenen tüm arayüz dilleri

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const yanit = (govde: unknown, durum = 200) =>
  new Response(JSON.stringify(govde), { status: durum, headers: cors });

// ————— WebVTT ayrıştırma: her cue = { bas (zaman satırı), metin[] } —————
// Zaman satırına ("... --> ...") ASLA dokunmayız; yalnız metin satırlarını çeviririz.
type Cue = { zaman: string; metin: string };
function vttAyristir(vtt: string): { baslik: string; cueler: Cue[] } {
  const bloklar = vtt.replace(/\r\n/g, "\n").split(/\n\n+/);
  const baslik = bloklar[0]?.startsWith("WEBVTT") ? bloklar[0] : "WEBVTT";
  const cueler: Cue[] = [];
  for (const blok of bloklar) {
    const satirlar = blok.split("\n").filter((x) => x.length > 0);
    const zamanIdx = satirlar.findIndex((x) => x.includes("-->"));
    if (zamanIdx === -1) continue; // başlık/NOTE blokları atlanır
    const zaman = satirlar[zamanIdx];
    const metin = satirlar.slice(zamanIdx + 1).join("\n");
    if (metin) cueler.push({ zaman, metin });
  }
  return { baslik, cueler };
}

// Orijinal zaman damgaları + çevrilmiş metinlerle VTT'yi yeniden kur (senkron korunur)
function vttKur(baslik: string, cueler: Cue[], ceviriler: string[]): string {
  const govde = cueler
    .map((c, i) => `${c.zaman}\n${ceviriler[i] ?? c.metin}`)
    .join("\n\n");
  return `${baslik.startsWith("WEBVTT") ? "WEBVTT" : "WEBVTT"}\n\n${govde}\n`;
}

async function cfIstek(yol: string, opt: RequestInit = {}) {
  const hesap = Deno.env.get("CF_ACCOUNT_ID");
  return fetch(`https://api.cloudflare.com/client/v4/accounts/${hesap}/stream/${yol}`, {
    ...opt,
    headers: { Authorization: `Bearer ${Deno.env.get("CF_API_TOKEN")}`, ...(opt.headers ?? {}) },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    // 1) Kullanıcıyı doğrula
    const istemci = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await istemci.auth.getUser();
    if (!user) return yanit({ hata: "Giriş gerekli" }, 401);

    const { video_id, kaynak_dil } = await req.json();
    if (!video_id || !kaynak_dil) return yanit({ hata: "video_id ve kaynak_dil zorunlu" }, 400);
    if (!/^[a-z]{2}$/i.test(kaynak_dil)) return yanit({ hata: "Geçersiz dil kodu" }, 400);

    // 2) Bölüm bu üreticiye mi ait?
    const servis = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: video } = await servis
      .from("videos").select("id, cf_uid, creator_id, captions").eq("id", video_id).single();
    if (!video || video.creator_id !== user.id) return yanit({ hata: "Yetkin yok" }, 403);
    if (!video.cf_uid) return yanit({ hata: "Video henüz Cloudflare'de hazır değil" }, 409);

    const uid = video.cf_uid;

    // 3) Kaynak dil altyazısının durumunu sor
    const durumCevap = await cfIstek(`${uid}/captions/${kaynak_dil}`);
    const durumJson = await durumCevap.json().catch(() => ({}));
    const durum = durumJson?.result?.status; // "inprogress" | "ready" | yok

    // 3a) Henüz yoksa → AI transkripsiyonunu başlat (asenkron; senkron VTT üretir)
    if (!durumCevap.ok || !durum) {
      const genCevap = await cfIstek(`${uid}/captions/${kaynak_dil}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!genCevap.ok) {
        const h = await genCevap.text();
        console.error("CF generate hatası:", h);
        return yanit({ hata: "Cloudflare transkripsiyonu başlatamadı" }, 502);
      }
      return yanit({ durum: "uretiliyor", mesaj: "Transkripsiyon başladı; birkaç dk sonra tekrar dene." });
    }
    // 3b) Hâlâ üretiliyor
    if (durum !== "ready") {
      return yanit({ durum: "uretiliyor", mesaj: "Transkripsiyon sürüyor; birkaç dk sonra tekrar dene." });
    }

    // 4) Kaynak VTT'yi indir
    const vttCevap = await cfIstek(`${uid}/captions/${kaynak_dil}/vtt`);
    if (!vttCevap.ok) return yanit({ hata: "Kaynak alt yazı indirilemedi" }, 502);
    const kaynakVtt = await vttCevap.text();
    const { baslik, cueler } = vttAyristir(kaynakVtt);
    if (cueler.length === 0) return yanit({ hata: "Kaynak alt yazı boş" }, 422);

    // 5) Çevrilecek hedef diller (kaynak + zaten var olanlar hariç)
    const mevcut = new Set([...(video.captions ?? []), kaynak_dil]);
    const hedefler = HEDEF_DILLER.filter((d) => !mevcut.has(d));

    const anahtar = Deno.env.get("ANTHROPIC_API_KEY");
    const eklenen: string[] = [];

    // Kaynak dil track'ini de captions listesine ekle (CF'de zaten hazır)
    if (!(video.captions ?? []).includes(kaynak_dil)) eklenen.push(kaynak_dil);

    if (anahtar && hedefler.length > 0) {
      const anthropic = new Anthropic({ apiKey: anahtar });
      const metinler = cueler.map((c) => c.metin);
      const sema = {
        type: "object",
        properties: {
          ceviriler: {
            type: "array",
            items: { type: "string" },
            description: "Translated cue texts, SAME length and order as input",
          },
        },
        required: ["ceviriler"],
        additionalProperties: false,
      };

      for (const hedef of hedefler) {
        try {
          const cevap = await anthropic.messages.create({
            model: "claude-opus-4-8",
            max_tokens: 8192,
            system: `You translate video subtitle cues from ${kaynak_dil} to ${hedef}. ` +
              `Return EXACTLY one translation per input cue, same order, same array length. ` +
              `Translate only the text; do not merge, split, add, or drop cues. Keep it natural and concise for on-screen reading.`,
            messages: [{ role: "user", content: JSON.stringify({ cueler: metinler }) }],
            output_config: { format: { type: "json_schema", schema: sema } },
          });
          if (cevap.stop_reason === "refusal") continue;
          const metin = cevap.content.find((b) => b.type === "text");
          const sonuc = JSON.parse(metin && "text" in metin ? metin.text : "{}");
          const ceviriler: string[] = sonuc.ceviriler ?? [];
          // Güvenlik: uzunluk eşleşmezse bu dili atla (senkron/hizalama bozulmasın)
          if (ceviriler.length !== cueler.length) {
            console.error(`${hedef}: cue sayısı uyuşmadı (${ceviriler.length}/${cueler.length})`);
            continue;
          }
          // Orijinal zaman damgalarıyla yeniden kur → senkron korunur
          const hedefVtt = vttKur(baslik, cueler, ceviriler);
          const form = new FormData();
          form.append("file", new Blob([hedefVtt], { type: "text/vtt" }), `${hedef}.vtt`);
          const yukle = await cfIstek(`${uid}/captions/${hedef}`, { method: "PUT", body: form });
          if ((await yukle.json().catch(() => ({}))).success) eklenen.push(hedef);
        } catch (e) {
          console.error(`${hedef} çeviri/yükleme hatası:`, e);
        }
      }
    }

    // 6) captions listesini güncelle (tekrarsız)
    const diller = Array.from(new Set([...(video.captions ?? []), ...eklenen]));
    await servis.from("videos").update({ captions: diller }).eq("id", video.id);

    return yanit({ durum: "tamam", captions: diller, eklenen });
  } catch (e) {
    console.error("generate-captions beklenmedik hata:", e);
    return yanit({ hata: "Beklenmedik hata" }, 500);
  }
});
