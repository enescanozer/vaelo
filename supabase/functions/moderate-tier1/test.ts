// moderate-tier1 birim testleri (Cloudflare/Supabase GEREKTİRMEZ — saf karar mantığı).
// Çalıştır: deno test supabase/functions/moderate-tier1/test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { tier1Karar, verdiktenSonuc } from "./lib.ts";

const temizGorsel = {
  frames_available: true, nudity: 0.1, violence: 0.1,
  hate_politics: 0.1, profanity: 0.1, toxicity: 0.1, keyword_hit: false,
};

Deno.test("tier1Karar: yüksek NSFW → rejected", () => {
  assertEquals(tier1Karar({ ...temizGorsel, nudity: 0.95 }), "rejected");
  assertEquals(tier1Karar({ ...temizGorsel, violence: 0.9 }), "rejected");
});

Deno.test("tier1Karar: hard keyword → rejected", () => {
  assertEquals(tier1Karar({ ...temizGorsel, keyword_hit: true }), "rejected");
});

Deno.test("tier1Karar: temiz + kare var → approved", () => {
  assertEquals(tier1Karar(temizGorsel), "approved");
});

Deno.test("tier1Karar: GÖRSEL NULL (kare yok) → asla approved, escalate", () => {
  const s = { frames_available: false, nudity: null, violence: null, hate_politics: 0.1, profanity: 0.1, toxicity: 0.1 };
  assertEquals(tier1Karar(s), "escalate");
});

Deno.test("tier1Karar: frames_available=false + görsel 0 → yine escalate (bilinmiyor sayılır)", () => {
  const s = { frames_available: false, nudity: 0, violence: 0, hate_politics: 0.1, profanity: 0.1, toxicity: 0.1 };
  assertEquals(tier1Karar(s), "escalate");
});

Deno.test("tier1Karar: orta görsel sinyal → escalate", () => {
  assertEquals(tier1Karar({ ...temizGorsel, nudity: 0.5 }), "escalate");
});

Deno.test("tier1Karar: TR düşük güven → otomatik onaylamaz, escalate", () => {
  assertEquals(tier1Karar({ ...temizGorsel, perspective_low_confidence: true }), "escalate");
});

Deno.test("tier1Karar: yüksek metin sinyali → escalate", () => {
  assertEquals(tier1Karar({ ...temizGorsel, hate_politics: 0.6 }), "escalate");
});

Deno.test("verdiktenSonuc: eşlemeler doğru", () => {
  assertEquals(verdiktenSonuc("rejected"), {
    finalAction: "REJECTED", needsTier2: false, status: "complete", videoStatus: "rejected", tier1Verdict: "rejected",
  });
  assertEquals(verdiktenSonuc("approved"), {
    finalAction: "APPROVED", needsTier2: false, status: "complete", videoStatus: "approved", tier1Verdict: "approved",
  });
  assertEquals(verdiktenSonuc("manual"), {
    finalAction: "MANUAL_REVIEW", needsTier2: false, status: "complete", videoStatus: null, tier1Verdict: "escalate",
  });
  assertEquals(verdiktenSonuc("escalate"), {
    finalAction: null, needsTier2: true, status: "pending", videoStatus: null, tier1Verdict: "escalate",
  });
});
