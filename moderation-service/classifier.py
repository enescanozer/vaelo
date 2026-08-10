# Self-hosted açık kaynak NSFW/şiddet sınıflandırıcı (transformers image-classification).
# Modeller env ile değiştirilebilir. CPU çıkarımı yeterli (kare başına ~ms-sn); GPU şart değil.
# Kare başına skorlanır, video skoru = kareler arası MAKS (en riskli an).
import io
import os

from PIL import Image

NSFW_MODEL = os.environ.get("NSFW_MODEL", "Falconsai/nsfw_image_detection")
# Şiddet modeli opsiyonel/değiştirilebilir; yoksa violence=0.0 (Tier 2 yakalar).
VIOLENCE_MODEL = os.environ.get("VIOLENCE_MODEL", "jaranohaal/vit-base-violence-detection")

_nsfw = None
_viol = None


def _pipe(model):
    from transformers import pipeline
    return pipeline("image-classification", model=model)


def _ensure():
    global _nsfw, _viol
    if _nsfw is None:
        _nsfw = _pipe(NSFW_MODEL)
    if _viol is None:
        try:
            _viol = _pipe(VIOLENCE_MODEL)
        except Exception:
            _viol = False  # model indirilemedi → şiddet skoru 0.0 kalır


def _skor(pipe, img, pozitif_etiketler) -> float:
    try:
        out = pipe(img)
    except Exception:
        return 0.0
    return max((o["score"] for o in out if o["label"].lower() in pozitif_etiketler), default=0.0)


def kareleri_skorla(kareler) -> dict:
    _ensure()
    nud = viol = 0.0
    flagged = []
    for t, b in kareler:
        try:
            img = Image.open(io.BytesIO(b)).convert("RGB")
        except Exception:
            continue
        n = _skor(_nsfw, img, {"nsfw", "porn", "sexy", "hentai"})
        v = _skor(_viol, img, {"violence", "violent", "fight", "blood"}) if _viol else 0.0
        nud = max(nud, n)
        viol = max(viol, v)
        if n > 0.6:
            flagged.append({"t": t, "reason": "nudity", "score": round(n, 3)})
        elif v > 0.6:
            flagged.append({"t": t, "reason": "violence", "score": round(v, 3)})
    return {
        "nudity": round(nud, 4),
        "violence": round(viol, 4),
        "flagged": flagged[:12],
        "frames_sampled": len(kareler),
        "frames_available": len(kareler) > 0,
    }
