# frames.py birim testleri — Cloudflare GEREKTİRMEZ (requests.get mock'lanır, CF_CODE monkeypatch).
# Çalıştır: cd moderation-service && pip install pytest requests && pytest test_frames.py
from unittest import mock

import frames


class SahteYanit:
    def __init__(self, ok=True, content=b"jpg"):
        self.ok = ok
        self.content = content


def test_kare_sayisi_suree_gore():
    assert frames._kare_sayisi(0) == 8        # süre yok → min
    assert frames._kare_sayisi(450) == 10     # 450/45 = 10
    assert frames._kare_sayisi(100000) == 15  # üst sınır
    assert frames._kare_sayisi(-100) == 8     # negatif → güvenli min


def test_stream_thumbs_cf_code_yoksa_bos(monkeypatch):
    monkeypatch.delenv("CF_CODE", raising=False)
    assert frames._stream_thumbs("uid123", 600) == []


def test_stream_thumbs_cf_uid_yoksa_bos(monkeypatch):
    monkeypatch.setenv("CF_CODE", "abc")
    assert frames._stream_thumbs("", 600) == []


def test_stream_thumbs_normal(monkeypatch):
    monkeypatch.setenv("CF_CODE", "abc")
    with mock.patch.object(frames.requests, "get",
                           return_value=SahteYanit(ok=True, content=b"jpgdata")) as g:
        kareler = frames._stream_thumbs("uid123", 450)  # 10 kare
        assert len(kareler) == 10
        t, b = kareler[0]
        assert isinstance(t, float) and b == b"jpgdata"
        cagri_url = g.call_args_list[0].args[0]
        assert "customer-abc.cloudflarestream.com/uid123/thumbnails/thumbnail.jpg" in cagri_url


def test_stream_thumbs_istek_hatasi_atlanir(monkeypatch):
    monkeypatch.setenv("CF_CODE", "abc")
    with mock.patch.object(frames.requests, "get", side_effect=Exception("network")):
        assert frames._stream_thumbs("uid123", 450) == []  # hepsi atlanır → boş


def test_stream_thumbs_ok_degil_atlanir(monkeypatch):
    monkeypatch.setenv("CF_CODE", "abc")
    with mock.patch.object(frames.requests, "get", return_value=SahteYanit(ok=False)):
        assert frames._stream_thumbs("uid123", 450) == []


def test_kare_getir_kaynak_yoksa_bos(monkeypatch):
    # cf_uid yok + source_url yok → boş (Stream entegre değil = stub davranışı)
    monkeypatch.delenv("CF_CODE", raising=False)
    assert frames.kare_getir(cf_uid=None, source_url=None, duration=0) == []
