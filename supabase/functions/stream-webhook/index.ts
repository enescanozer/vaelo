// stream-webhook — Cloudflare Stream webhook'u: video işlenip hazır olduğunda
// videos.status'u 'in_review' yapar. ASLA doğrudan 'approved' yapmaz; yayın kararı
// yalnızca admin panelinden verilir.
//
// Dağıtım (Cloudflare JWT gönderemeyeceği için JWT doğrulaması kapalı):
//   supabase functions deploy stream-webhook --no-verify-jwt
// Secret'lar:
//   supabase secrets set CF_WEBHOOK_SECRET=...   (Cloudflare webhook oluştururken verilen sır)
// Cloudflare tarafı: Stream → Webhooks → bu fonksiyonun URL'ini ekle.
import { createClient } from "npm:@supabase/supabase-js@2";

// İmza doğrulama: Webhook-Signature başlığı "time=<ts>,sig1=<hmac>" biçimindedir;
// HMAC-SHA256("<ts>.<govde>", CF_WEBHOOK_SECRET) ile karşılaştırılır.
async function imzaGecerliMi(req: Request, govde: string): Promise<boolean> {
  const sir = Deno.env.get("CF_WEBHOOK_SECRET");
  if (!sir) return true; // sır tanımlı değilse doğrulamayı atla (geliştirme kolaylığı)

  const baslik = req.headers.get("Webhook-Signature") ?? "";
  const zaman = baslik.match(/time=(\d+)/)?.[1];
  const imza = baslik.match(/sig1=([0-9a-f]+)/)?.[1];
  if (!zaman || !imza) return false;

  const anahtar = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sir),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const ozet = await crypto.subtle.sign(
    "HMAC",
    anahtar,
    new TextEncoder().encode(`${zaman}.${govde}`)
  );
  const beklenen = Array.from(new Uint8Array(ozet))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return beklenen === imza;
}

Deno.serve(async (req) => {
  try {
    const govde = await req.text();
    if (!(await imzaGecerliMi(req, govde))) {
      return new Response("gecersiz imza", { status: 401 });
    }

    const veri = JSON.parse(govde);
    const uid: string | undefined = veri?.uid;
    const durum: string | undefined = veri?.status?.state;
    if (!uid) return new Response("uid yok", { status: 400 });

    const servis = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (durum === "ready") {
      // Yalnızca henüz karara bağlanmamış kayıtları incelemeye taşı —
      // onaylanmış/reddedilmiş bir videoyu webhook geri döndüremez.
      const { error } = await servis
        .from("videos")
        .update({
          status: "in_review",
          duration_seconds: veri?.duration ?? 0,
        })
        .eq("cf_uid", uid)
        .in("status", ["uploading", "processing"]);
      if (error) {
        console.error("in_review güncellemesi başarısız:", error.message);
        return new Response("guncelleme hatasi", { status: 500 });
      }
    } else if (durum === "error") {
      // İşleme hatası: kayıt reddedilmiş sayılır, üretici yeniden yükler
      await servis
        .from("videos")
        .update({ status: "rejected" })
        .eq("cf_uid", uid)
        .in("status", ["uploading", "processing"]);
    }
    // diğer durumlar (inprogress vb.) sessizce geçilir

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("stream-webhook beklenmedik hata:", e);
    return new Response("beklenmedik hata", { status: 500 });
  }
});
