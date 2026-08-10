// moderate-tier1 saf karar mantığı (Deno.serve İÇERMEZ → test import eder). Davranış index.ts ile AYNI.

// KISA DEVRE kararı: 'rejected' | 'approved' | 'escalate'.
// GÜVENLİK: görsel skor (nudity/violence) NULL olabilir (kare yok). null → görsel BİLİNMİYOR →
// asla "temiz"/APPROVED sayılmaz → escalate. Metin sinyalleri tek başına görsel onayına yetmez.
export function tier1Karar(sc: any): string {
  const gorselMax = Math.max(sc.nudity ?? 0, sc.violence ?? 0);
  if (gorselMax >= 0.9 || sc.keyword_hit === true) return "rejected";

  const gorselTemiz =
    sc.frames_available === true &&
    typeof sc.nudity === "number" && sc.nudity < 0.3 &&
    typeof sc.violence === "number" && sc.violence < 0.3;
  const metinTemiz =
    (sc.hate_politics ?? 0) < 0.3 && (sc.profanity ?? 0) < 0.3 && (sc.toxicity ?? 0) < 0.3;
  const trBelirsiz = sc.perspective_low_confidence === true;

  if (gorselTemiz && metinTemiz && sc.keyword_hit !== true && !trBelirsiz) return "approved";
  return "escalate";
}

export interface Tier1Sonuc {
  finalAction: string | null; // moderation_results.final_action
  needsTier2: boolean;
  status: string;             // moderation_results.status
  videoStatus: string | null; // videos.status — YALNIZ approved/rejected (aksi in_review kalır)
  tier1Verdict: string;       // 'approved'|'rejected'|'escalate'
}

// verdict → yazılacak durum. 'manual' (compute başarısız) → MANUAL_REVIEW + complete, video in_review kalır.
export function verdiktenSonuc(verdict: string): Tier1Sonuc {
  switch (verdict) {
    case "rejected":
      return { finalAction: "REJECTED", needsTier2: false, status: "complete", videoStatus: "rejected", tier1Verdict: "rejected" };
    case "approved":
      return { finalAction: "APPROVED", needsTier2: false, status: "complete", videoStatus: "approved", tier1Verdict: "approved" };
    case "manual":
      return { finalAction: "MANUAL_REVIEW", needsTier2: false, status: "complete", videoStatus: null, tier1Verdict: "escalate" };
    default: // escalate → Tier 2 (cron)
      return { finalAction: null, needsTier2: true, status: "pending", videoStatus: null, tier1Verdict: "escalate" };
  }
}
