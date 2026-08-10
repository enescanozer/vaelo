# Vaelo moderasyon compute servisi (Fly.io) — Tier 1 medya işleme.
# Cloudflare Workers/Supabase Edge Functions ffmpeg/GPU/ağır ikili ÇALIŞTIRAMAZ; bu
# yüzden kare çıkarma + NSFW/şiddet sınıflandırma BURADA (ayrı Docker servisi) yapılır.
# Edge Function bunu HTTP ile çağırır (yalnız orkestrasyon eder). Kimlik: paylaşılan
# bearer token (COMPUTE_SERVICE_TOKEN) — hem Supabase secrets hem Fly secrets'ta aynı.
#
# ÖNEMLİ: kare kaynağı Cloudflare Stream'e bağlıdır (thumbnail API) ya da doğrudan
# video URL'ine (ffmpeg). Stream ENTEGRE DEĞİLKEN ve URL yokken kare listesi BOŞ döner;
# frames_available=false olur. Karar (kısa devre) Edge Function'da; görsel sinyal yoksa
# ASLA otomatik onay verilmez (bkz. moderate-tier1).
import os
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from blocklist import blocklist_tara
from perspective import perspective_skorla
from frames import kare_getir
from classifier import kareleri_skorla

SERVICE_TOKEN = os.environ.get("COMPUTE_SERVICE_TOKEN", "")

app = FastAPI(title="vaelo-moderation")


class Tier1Istek(BaseModel):
    video_id: str
    cf_uid: str | None = None        # Cloudflare Stream UID (thumbnail kaynağı)
    source_url: str | None = None    # alternatif: doğrudan video URL (ffmpeg)
    duration_seconds: float | None = None
    lang: str = "en"                 # metnin ana dili (blocklist + Perspective)
    text: dict = {}                  # {name, description}


def _auth(authorization: str):
    if not SERVICE_TOKEN or authorization != f"Bearer {SERVICE_TOKEN}":
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/tier1")
def tier1(req: Tier1Istek, authorization: str = Header(default="")):
    _auth(authorization)
    metin = f"{req.text.get('name', '')} {req.text.get('description', '')}".strip()

    # 1) Keyword/regex blocklist (TR + EN + metnin dili) — anında sinyal
    kw = blocklist_tara(metin, req.lang)
    # 2) Perspective (toksisite/hakaret/tehdit/kimlik saldırısı) — TR düşük güven
    persp = perspective_skorla(metin, req.lang)
    # 3) Sahne-değişimi kare örneklemesi → NSFW/şiddet (Stream thumbs ya da ffmpeg)
    kareler = kare_getir(
        cf_uid=req.cf_uid, source_url=req.source_url, duration=req.duration_seconds or 0
    )
    gorsel = kareleri_skorla(kareler)  # {nudity, violence, flagged[], frames_sampled, frames_available}

    # Ham sinyaller — KARAR Edge Function'da (kısa devre eşikleri orada).
    return {
        "tier1_scores": {
            "nudity": gorsel["nudity"],
            "violence": gorsel["violence"],
            "hate_politics": persp["hate_politics"],
            "profanity": persp["profanity"],
            "toxicity": persp["toxicity"],
            "keyword_hit": kw["hit"],
            "keyword_terms": kw["terms"],
            "perspective_lang": persp["lang"],
            "perspective_low_confidence": persp["low_confidence"],
            "frames_sampled": gorsel["frames_sampled"],
            "frames_available": gorsel["frames_available"],
        },
        "flagged_timestamps": gorsel["flagged"],  # [{t, reason}] — Tier 2 bu kareleri çeker
    }
