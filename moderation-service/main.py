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
# NOT: classifier (torch + transformers NSFW/şiddet modeli, ~1.5-2 GB) MODÜL DÜZEYİNDE
# import EDİLMEZ → LAZY. Yalnız /tier1 çağrılınca belleğe yüklenir. Böylece startup + /health +
# /text (forum & nickname blocklist) torch YÜKLEMEDEN çalışır ve Render free 512 MB'ta OOM olmaz.
# (Video/Cloudflare player koduyla ilgisizdir; yalnız compute servisi importları.)

SERVICE_TOKEN = os.environ.get("COMPUTE_SERVICE_TOKEN", "")

app = FastAPI(title="vaelo-moderation")


class Tier1Istek(BaseModel):
    video_id: str
    cf_uid: str | None = None        # Cloudflare Stream UID (thumbnail kaynağı)
    source_url: str | None = None    # alternatif: doğrudan video URL (ffmpeg)
    duration_seconds: float | None = None
    lang: str = "en"                 # metnin ana dili (blocklist + Perspective)
    text: dict = {}                  # {name, description}


class TextIstek(BaseModel):
    text: str
    lang: str = "en"
    context: str = "generic"  # "nickname" | "forum" | ... (yalnız bağlam bilgisi)


def _auth(authorization: str):
    if not SERVICE_TOKEN or authorization != f"Bearer {SERVICE_TOKEN}":
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/health")
def health():
    return {"ok": True}


# Kısa metin (takma ad, yorum vb.) için keyword/regex blocklist taraması. Video/kare YOK,
# Perspective YOK (API anahtarı gerektirmesin, senkron+hızlı olsun) — yalnız blocklist_tara.
@app.post("/text")
def text_moderation(req: TextIstek, authorization: str = Header(default="")):
    _auth(authorization)
    kw = blocklist_tara(req.text or "", req.lang)
    blocked = kw["hit"]
    # 'blocked' geriye dönük (set-nickname bunu okur — nickname davranışı DEĞİŞMEZ).
    # 'allowed'/'reason'/'category' forum için. Kategori keyword blocklist tabanlı → 'profanity'
    # (uydurma AI kategorisi YOK; ilk aşamada mevcut blocklist neyi destekliyorsa o).
    return {
        "blocked": blocked,
        "allowed": not blocked,
        "terms": kw["terms"],
        "reason": "blocklist" if blocked else None,
        "category": "profanity" if blocked else None,
        "context": req.context,
    }


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
    # LAZY import: torch/transformers modelleri YALNIZ burada (Tier 1) belleğe yüklenir.
    from classifier import kareleri_skorla
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
