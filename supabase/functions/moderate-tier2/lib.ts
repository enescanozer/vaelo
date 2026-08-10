// moderate-tier2 saf karar mantığı (Deno.serve İÇERMEZ → test import eder).
// 4-kategori MAKS → eylem eşiği (DEĞİŞTİRME): APPROVED <0.40 · MANUAL_REVIEW 0.40–0.85 · REJECTED ≥0.85.
export function finalEylem(sc: any): string {
  const maks = Math.max(
    sc.nudity ?? 0,
    sc.violence ?? 0,
    sc.hate_politics ?? 0,
    sc.profanity ?? 0,
  );
  if (maks >= 0.85) return "REJECTED";
  if (maks >= 0.4) return "MANUAL_REVIEW";
  return "APPROVED";
}
