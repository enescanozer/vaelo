// moderate-tier2 birim testleri (saf eşik mantığı).
// Çalıştır: deno test supabase/functions/moderate-tier2/test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { finalEylem } from "./lib.ts";

Deno.test("finalEylem: max <0.40 → APPROVED", () => {
  assertEquals(finalEylem({ nudity: 0.1, violence: 0.2, hate_politics: 0.39, profanity: 0.0 }), "APPROVED");
});

Deno.test("finalEylem: 0.40 ≤ max < 0.85 → MANUAL_REVIEW", () => {
  assertEquals(finalEylem({ nudity: 0.4, violence: 0, hate_politics: 0, profanity: 0 }), "MANUAL_REVIEW");
  assertEquals(finalEylem({ nudity: 0, violence: 0.84, hate_politics: 0, profanity: 0 }), "MANUAL_REVIEW");
});

Deno.test("finalEylem: max ≥ 0.85 → REJECTED", () => {
  assertEquals(finalEylem({ nudity: 0, violence: 0, hate_politics: 0, profanity: 0.85 }), "REJECTED");
  assertEquals(finalEylem({ nudity: 0.99, violence: 0, hate_politics: 0, profanity: 0 }), "REJECTED");
});

Deno.test("finalEylem: null kategoriler 0 sayılır", () => {
  assertEquals(finalEylem({ nudity: null, violence: null, hate_politics: null, profanity: null }), "APPROVED");
  assertEquals(finalEylem({ nudity: null, violence: 0.9, hate_politics: null, profanity: null }), "REJECTED");
});
