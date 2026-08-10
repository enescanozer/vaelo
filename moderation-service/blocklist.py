# Keyword/regex blocklist — TR + EN (diğer 6 dile genişletilebilir: blocklists/<dil>.txt).
# Kelime-sınırlı (\b) eşleşme, büyük/küçük harf duyarsız. HARD match → Edge Function'da
# tek başına REJECTED kısa devresi tetikler (Tier 2'ye gitmeden).
import os
import re

_DIR = os.path.join(os.path.dirname(__file__), "blocklists")


def _yukle(dil: str) -> list[str]:
    yol = os.path.join(_DIR, f"{dil}.txt")
    if not os.path.exists(yol):
        return []
    with open(yol, encoding="utf-8") as f:
        return [s.strip() for s in f if s.strip() and not s.startswith("#")]


def _regex(terimler: list[str]):
    if not terimler:
        return None
    # Not: TR'de aksan/ek çekimleri için ileride normalize + kök eşleme eklenebilir.
    return re.compile(r"\b(" + "|".join(re.escape(t) for t in terimler) + r")\b", re.IGNORECASE)


_LISTELER = {d: _yukle(d) for d in ("tr", "en")}
_REGEX = {d: _regex(ts) for d, ts in _LISTELER.items()}


def blocklist_tara(metin: str, dil: str) -> dict:
    # 8 dil desteği: her zaman TR + EN taranır; metnin dili ayrıca (listesi varsa).
    diller = {"tr", "en", dil}
    hits: list[str] = []
    for d in diller:
        rx = _REGEX.get(d)
        if rx:
            hits += [m.group(0).lower() for m in rx.finditer(metin or "")]
    return {"hit": bool(hits), "terms": sorted(set(hits))}
