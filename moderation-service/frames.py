# Kare kaynağı — ÖNCELİK:
#   1) Cloudflare Stream thumbnail API (cf_uid) — hafif, ffmpeg gerekmez (TERCİH).
#   2) source_url + ffmpeg SAHNE-DEĞİŞİMİ örneklemesi (ffmpeg Docker imajında var).
#
# ⚠️ CLOUDFLARE STREAM ENGELLEYEN ÖN KOŞUL: proje henüz Stream'e bağlı DEĞİL.
#    Stream yoksa VE source_url yoksa → BOŞ liste döner (frames_available=false).
#    Bu STUB davranıştır: Edge Function görsel sinyal olmadığında otomatik ONAY VERMEZ,
#    içeriği MANUAL_REVIEW'e (admin izler) ya da metin sinyali güçlüyse Tier 2'ye yönlendirir.
#    Stream bağlanınca cf_uid gelir ve bu yol otomatik devreye girer — kod değişmez.
import glob
import os
import subprocess
import tempfile

import requests

CF_CODE = os.environ.get("CF_CODE", "")  # customer-<CODE>.cloudflarestream.com

# 10 dk için 8–15 kare (spec). Süreye göre kare sayısı; süre yoksa 8 sabit nokta.
_MIN, _MAX = 8, 15


def _kare_sayisi(duration: float) -> int:
    if not duration:
        return _MIN
    return max(_MIN, min(_MAX, int(duration / 45) or _MIN))


def _stream_thumbs(cf_uid: str, duration: float):
    if not (CF_CODE and cf_uid):
        return []
    n = _kare_sayisi(duration)
    taban = f"https://customer-{CF_CODE}.cloudflarestream.com/{cf_uid}/thumbnails/thumbnail.jpg"
    kareler = []
    for i in range(n):
        t = duration * (i + 0.5) / n if duration else i * 30
        try:
            r = requests.get(taban, params={"time": f"{t}s", "height": 400}, timeout=8)
            if r.ok and r.content:
                kareler.append((round(t, 1), r.content))
        except Exception:
            pass
    return kareler


def _ffmpeg_scenes(source_url: str, duration: float):
    if not source_url:
        return []
    # Sahne kesimlerinde kare çıkar (select='gt(scene,0.4)'), 15 ile sınırla. Bu iş
    # ayrı compute servisinde — ASLA Workers/Edge Function içinde değil.
    with tempfile.TemporaryDirectory() as d:
        try:
            subprocess.run(
                ["ffmpeg", "-i", source_url, "-vf",
                 "select='gt(scene,0.4)',scale=400:-1", "-vsync", "vfr",
                 "-frames:v", str(_MAX), f"{d}/k_%03d.jpg"],
                check=True, timeout=180, capture_output=True,
            )
        except Exception:
            return []
        kareler = []
        yollar = sorted(glob.glob(f"{d}/k_*.jpg"))
        for i, p in enumerate(yollar):
            with open(p, "rb") as f:
                t = duration * (i + 0.5) / max(len(yollar), 1) if duration else i * 30
                kareler.append((round(t, 1), f.read()))
        return kareler


def kare_getir(cf_uid: str = None, source_url: str = None, duration: float = 0):
    """[(t_seconds, jpg_bytes)] — Stream thumbs varsa onu, yoksa ffmpeg, yoksa boş."""
    kareler = _stream_thumbs(cf_uid, duration)
    if not kareler:
        kareler = _ffmpeg_scenes(source_url, duration)
    return kareler
