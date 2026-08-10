// stream-webhook birim testleri (Cloudflare GEREKTİRMEZ — saf yardımcılar).
// Çalıştır: deno test supabase/functions/stream-webhook/test.ts --allow-env
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { imzaGecerliMi, tier1Tetikle, tier1TetiklenmeliMi } from "./lib.ts";

// Verilen gövde + sır için geçerli Webhook-Signature üretir (CF biçimi).
async function imzaUret(govde: string, sir: string, ts = "1700000000") {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(sir),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${govde}`));
  const sig = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `time=${ts},sig1=${sig}`;
}

// 1) Geçerli ready + gerçek geçiş (1 satır güncellendi) → tier1 tetiklenir
Deno.test("gecerli ready + gecis → tetikle", () => {
  assertEquals(tier1TetiklenmeliMi("ready", 1), true);
});

// 3) Stream error → asla tetiklenmez (satır olsa bile)
Deno.test("error durumu → tetiklemez", () => {
  assertEquals(tier1TetiklenmeliMi("error", 0), false);
  assertEquals(tier1TetiklenmeliMi("error", 1), false);
});

// 4+5) Duplicate webhook (zaten in_review → 0 satır) ve bilinmeyen cf_uid (0 satır) → tetiklemez
Deno.test("duplicate / bilinmeyen cf_uid (0 satir) → tetiklemez", () => {
  assertEquals(tier1TetiklenmeliMi("ready", 0), false);
});

// inprogress vb. → tetiklemez
Deno.test("ready disi durum → tetiklemez", () => {
  assertEquals(tier1TetiklenmeliMi("inprogress", 5), false);
  assertEquals(tier1TetiklenmeliMi(undefined, 1), false);
});

// 2) Geçersiz HMAC → imza reddedilir (handler 401 döner, tier1'e ULAŞMAZ)
Deno.test("HMAC: gecerli → true, gecersiz/eksik → false", async () => {
  Deno.env.set("CF_WEBHOOK_SECRET", "test-secret");
  const govde = JSON.stringify({ uid: "abc", status: { state: "ready" } });

  const iyiImza = await imzaUret(govde, "test-secret");
  const reqOk = new Request("http://x", { headers: { "Webhook-Signature": iyiImza } });
  assertEquals(await imzaGecerliMi(reqOk, govde), true);

  // Yanlış imza
  const reqBad = new Request("http://x", { headers: { "Webhook-Signature": "time=1700000000,sig1=deadbeef" } });
  assertEquals(await imzaGecerliMi(reqBad, govde), false);

  // Yanlış sır ile üretilmiş imza
  const kotuImza = await imzaUret(govde, "wrong-secret");
  const reqWrong = new Request("http://x", { headers: { "Webhook-Signature": kotuImza } });
  assertEquals(await imzaGecerliMi(reqWrong, govde), false);

  // Başlık yok
  const reqNone = new Request("http://x");
  assertEquals(await imzaGecerliMi(reqNone, govde), false);
});

// Sıra senaryoları: her webhook bağımsız; karar per-call (status geçişine göre satır sayısı).
Deno.test("sıra: ready→error / error→ready — yalnız gerçek ready+geçiş tetikler", () => {
  assertEquals(tier1TetiklenmeliMi("ready", 1), true); // ilk ready: 1 satır geçti → tetikle
  assertEquals(tier1TetiklenmeliMi("error", 0), false); // ardından error → asla
  // error önce rejected yaptıysa, sonraki ready update'i 0 satır eşler (terminal) → tetiklemez
  assertEquals(tier1TetiklenmeliMi("ready", 0), false);
});

Deno.test("duplicate error (tekrar, 0 satır) → asla tetiklemez", () => {
  assertEquals(tier1TetiklenmeliMi("error", 0), false);
  assertEquals(tier1TetiklenmeliMi("error", 0), false);
});

// Tier1 failure/timeout: tier1Tetikle fetch hatasını YUTAR (webhook 200 dönmeye devam eder).
Deno.test("tier1Tetikle: fetch hatası yutulur (throw etmez)", async () => {
  const orij = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error("timeout"));
  try {
    await tier1Tetikle("http://x", "key", "vid-1"); // throw ETMEMELİ
  } finally {
    globalThis.fetch = orij;
  }
});

Deno.test("tier1Tetikle: doğru URL + video_id + service-role ile çağırır", async () => {
  const orij = globalThis.fetch;
  let cagrilan: any = null;
  globalThis.fetch = ((url: any, opt: any) => {
    cagrilan = { url, body: opt?.body, auth: opt?.headers?.Authorization };
    return Promise.resolve(new Response("ok"));
  }) as typeof fetch;
  try {
    await tier1Tetikle("http://sb", "svc-key", "vid-9");
    assertEquals(cagrilan.url, "http://sb/functions/v1/moderate-tier1");
    assertEquals(JSON.parse(cagrilan.body).video_id, "vid-9");
    assertEquals(cagrilan.auth, "Bearer svc-key");
  } finally {
    globalThis.fetch = orij;
  }
});
