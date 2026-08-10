// Mock/local E2E moderasyon akışı — GERÇEK karar fonksiyonlarını zincirler (Cloudflare/DB YOK).
// Simülasyon: ready → in_review → tier1 → kare örnekleme → tier2/escalate → final durum.
// Çalıştır: deno test supabase/functions/moderate-tier1/e2e.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { tier1TetiklenmeliMi } from "../stream-webhook/lib.ts";
import { tier1Karar, verdiktenSonuc } from "./lib.ts";
import { finalEylem } from "../moderate-tier2/lib.ts";

function akisiCalistir(profil: {
  tier1Scores: any; // compute Tier 1 çıktısı
  framesAvailableTier2: boolean; // Tier 2'de kare çekilebiliyor mu (CF_CODE + cf_uid)
  tier2Scores?: any; // escalate olursa Claude 4-kategori çıktısı
}) {
  // 1) Webhook: ready + gerçek geçiş (1 satır) → tier1 tetiklenir
  if (!tier1TetiklenmeliMi("ready", 1)) return { state: "in_review", tier: 0 };

  // 2) Tier 1 kararı
  const verdict = tier1Karar(profil.tier1Scores);
  const t1 = verdiktenSonuc(verdict);
  if (verdict !== "escalate") {
    return { state: t1.finalAction, videoStatus: t1.videoStatus ?? "in_review", tier: 1 };
  }

  // 3) Escalate → Tier 2. Kare yoksa (Stream entegre değil) görüntü görülemez → MANUAL_REVIEW.
  if (!profil.framesAvailableTier2) {
    return { state: "MANUAL_REVIEW", videoStatus: "in_review", tier: 2 };
  }
  // 4) Tier 2 skorları → final eylem + videos.status
  const action = finalEylem(profil.tier2Scores ?? {});
  const videoStatus = action === "APPROVED" ? "approved" : action === "REJECTED" ? "rejected" : "in_review";
  return { state: action, videoStatus, tier: 2 };
}

Deno.test("E2E: temiz + kare → Tier1 APPROVED", () => {
  assertEquals(
    akisiCalistir({
      tier1Scores: { frames_available: true, nudity: 0.1, violence: 0.1, hate_politics: 0.1, profanity: 0.1, toxicity: 0.1 },
      framesAvailableTier2: true,
    }),
    { state: "APPROVED", videoStatus: "approved", tier: 1 },
  );
});

Deno.test("E2E: yüksek NSFW → Tier1 REJECTED", () => {
  assertEquals(
    akisiCalistir({ tier1Scores: { frames_available: true, nudity: 0.95 }, framesAvailableTier2: true }),
    { state: "REJECTED", videoStatus: "rejected", tier: 1 },
  );
});

Deno.test("E2E: görsel null (Stream yok) → escalate → kare yok → MANUAL_REVIEW", () => {
  assertEquals(
    akisiCalistir({
      tier1Scores: { frames_available: false, nudity: null, violence: null, hate_politics: 0.1, profanity: 0.1 },
      framesAvailableTier2: false,
    }),
    { state: "MANUAL_REVIEW", videoStatus: "in_review", tier: 2 },
  );
});

Deno.test("E2E: belirsiz → escalate → Tier2 kare var → REJECTED", () => {
  assertEquals(
    akisiCalistir({
      tier1Scores: { frames_available: true, nudity: 0.5 },
      framesAvailableTier2: true,
      tier2Scores: { nudity: 0.92, violence: 0.1, hate_politics: 0.1, profanity: 0.1 },
    }),
    { state: "REJECTED", videoStatus: "rejected", tier: 2 },
  );
});

Deno.test("E2E: belirsiz → escalate → Tier2 orta bant → MANUAL_REVIEW", () => {
  assertEquals(
    akisiCalistir({
      tier1Scores: { frames_available: true, nudity: 0.5 },
      framesAvailableTier2: true,
      tier2Scores: { nudity: 0.6, violence: 0.1, hate_politics: 0.1, profanity: 0.1 },
    }),
    { state: "MANUAL_REVIEW", videoStatus: "in_review", tier: 2 },
  );
});

Deno.test("E2E: belirsiz → escalate → Tier2 temiz → APPROVED", () => {
  assertEquals(
    akisiCalistir({
      tier1Scores: { frames_available: true, nudity: 0.5 },
      framesAvailableTier2: true,
      tier2Scores: { nudity: 0.2, violence: 0.1, hate_politics: 0.1, profanity: 0.1 },
    }),
    { state: "APPROVED", videoStatus: "approved", tier: 2 },
  );
});
