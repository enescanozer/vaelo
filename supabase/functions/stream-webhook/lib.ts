// stream-webhook saf/test-edilebilir yardımcıları (Deno.serve İÇERMEZ → test import eder).
// Davranış index.ts'ten AYNI; yalnız test edilebilirlik için ayrıldı.

// İmza doğrulama: Webhook-Signature "time=<ts>,sig1=<hmac>"; HMAC-SHA256("<ts>.<govde>", secret).
export async function imzaGecerliMi(req: Request, govde: string): Promise<boolean> {
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
    ["sign"],
  );
  const ozet = await crypto.subtle.sign(
    "HMAC",
    anahtar,
    new TextEncoder().encode(`${zaman}.${govde}`),
  );
  const beklenen = Array.from(new Uint8Array(ozet))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return beklenen === imza;
}

// Tier 1 YALNIZCA video GERÇEKTEN in_review'e YENİ geçtiyse tetiklenir.
// durum "ready" DEĞİLSE (error/inprogress) → false. Güncellenen satır 0 ise (duplicate/retry:
// video zaten in_review; ya da bilinmeyen cf_uid) → false. Böylece duplicate webhook ASLA
// ikinci moderasyon tetiklemez (yeni kuyruk mimarisi gerekmez; mevcut status geçişi yeterli).
export function tier1TetiklenmeliMi(durum: string | undefined, guncellenenSayisi: number): boolean {
  return durum === "ready" && guncellenenSayisi > 0;
}

// moderate-tier1'i service role ile tetikler (verify_jwt=true → service key geçerli JWT).
// Hata webhook'u DÜŞÜRMEZ: fallback zamanlanmış tarama (moderate-tier1 gövdesiz çağrı) yakalar.
export async function tier1Tetikle(supabaseUrl: string, serviceKey: string, videoId: string) {
  try {
    await fetch(`${supabaseUrl}/functions/v1/moderate-tier1`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ video_id: videoId }),
    });
  } catch (e) {
    console.error("moderate-tier1 tetiklenemedi (fallback: zamanlanmış tarama):", e);
  }
}
