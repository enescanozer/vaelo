# Perspective API (Google) — toksisite/hakaret/tehdit/kimlik-saldırısı sinyalleri.
# 4-kategoriye eşleme: profanity←PROFANITY, hate_politics←max(IDENTITY_ATTACK,THREAT),
# toxicity←TOXICITY (yardımcı). Türkçe desteği sınırlı → low_confidence=true işaretlenir;
# Edge Function belirsiz TR içeriği otomatik ONAYLAMAZ, Tier 2'ye iter.
import os
import requests

_KEY = os.environ.get("PERSPECTIVE_API_KEY", "")
_URL = "https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze"
_DESTEKLI = {"en", "es", "fr", "de", "ru", "ar", "tr"}  # Perspective'in denediği diller


def perspective_skorla(metin: str, dil: str) -> dict:
    bos = {
        "toxicity": 0.0, "profanity": 0.0, "hate_politics": 0.0,
        "lang": dil, "low_confidence": dil == "tr",
    }
    if not _KEY or not (metin or "").strip():
        return bos
    try:
        r = requests.post(
            _URL, params={"key": _KEY},
            json={
                "comment": {"text": metin[:3000]},
                "languages": [dil if dil in _DESTEKLI else "en"],
                "requestedAttributes": {
                    "TOXICITY": {}, "PROFANITY": {},
                    "IDENTITY_ATTACK": {}, "THREAT": {}, "INSULT": {},
                },
            },
            timeout=10,
        )
        r.raise_for_status()
        skor = r.json()["attributeScores"]

        def sc(a):
            return skor.get(a, {}).get("summaryScore", {}).get("value", 0.0)

        return {
            "toxicity": sc("TOXICITY"),
            "profanity": sc("PROFANITY"),
            "hate_politics": max(sc("IDENTITY_ATTACK"), sc("THREAT")),
            "lang": dil,
            "low_confidence": dil == "tr",  # TR skorlarına düşük güven → Tier 2 eğilimi
        }
    except Exception:
        return bos
