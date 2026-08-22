// Analiz panosu (yalnızca admin): özet, günlük trend, en çok izlenenler, tekrar izleme.
// Veri, sql/03_analytics.sql'deki security definer fonksiyonlardan (rpc) gelir.
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useLang } from "./i18n";
import { t } from "./theme";
import { getTitlesForTest, setTitleTest } from "./catalog";

export default function AnalyticsPanel() {
  const { s } = useLang();
  const [ozet, setOzet] = useState(null);
  const [gunluk, setGunluk] = useState([]);
  const [enCok, setEnCok] = useState([]);
  const [tekrar, setTekrar] = useState(null);
  const [hata, setHata] = useState(null);
  const [basliklar, setBasliklar] = useState([]); // test içeriği yönetimi (is_test)

  useEffect(() => {
    getTitlesForTest().then(setBasliklar).catch(() => {});
  }, []);

  async function testDegis(id, yeni) {
    setBasliklar((eski) => eski.map((b) => (b.id === id ? { ...b, is_test: yeni } : b)));
    const { error } = await setTitleTest(id, yeni);
    if (error) setBasliklar((eski) => eski.map((b) => (b.id === id ? { ...b, is_test: !yeni } : b)));
  }

  useEffect(() => {
    Promise.all([
      supabase.rpc("analytics_summary"),
      supabase.rpc("analytics_daily", { gun_sayisi: 14 }),
      supabase.rpc("analytics_top_titles", { adet: 10 }),
      supabase.rpc("analytics_rewatch"),
    ]).then(([o, g, e, r]) => {
      const ilkHata = o.error || g.error || e.error || r.error;
      if (ilkHata) {
        setHata(ilkHata.message);
        return;
      }
      setOzet(Array.isArray(o.data) ? o.data[0] : o.data);
      setGunluk(g.data ?? []);
      setEnCok(e.data ?? []);
      setTekrar(r.data);
    });
  }, []);

  if (hata) {
    return (
      <div style={{ padding: `80px ${t.pad}`, textAlign: "center", color: t.danger, fontSize: 14 }}>
        {s.analiz.hata(hata)}
      </div>
    );
  }

  const enYuksek = Math.max(1, ...gunluk.map((g) => Number(g.izlenme)));

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: t.pad }}>
      <div style={{ fontFamily: t.display, fontWeight: 800, fontSize: 26, marginBottom: 28 }}>
        {s.analiz.baslik}
      </div>

      {/* Özet kartları */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 14,
          marginBottom: 36,
        }}
      >
        <OzetKart etiket={s.analiz.toplamIzlenme} deger={ozet?.toplam_izlenme} locale={s.locale} />
        <OzetKart etiket={s.analiz.son7} deger={ozet?.son7_gun} locale={s.locale} />
        <OzetKart etiket={s.analiz.tekilIzleyici} deger={ozet?.tekil_izleyici} locale={s.locale} />
        <OzetKart
          etiket={s.analiz.tekrarOrani}
          deger={
            tekrar == null
              ? undefined
              : s.analiz.yuzde(Number(tekrar).toLocaleString(s.locale))
          }
          locale={s.locale}
        />
      </div>

      {/* Günlük trend — basit sütun grafiği */}
      <Bolum ad={s.analiz.gunluk}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 140 }}>
          {gunluk.map((g) => (
            <div key={g.gun} style={{ flex: 1, textAlign: "center" }}>
              <div
                title={`${g.gun}: ${g.izlenme}`}
                style={{
                  height: Math.max(3, (Number(g.izlenme) / enYuksek) * 120),
                  background: t.gradient,
                  borderRadius: 3,
                  opacity: 0.9,
                }}
              />
              <div style={{ color: t.dim, fontSize: 10, marginTop: 6 }}>
                {new Date(g.gun).toLocaleDateString(s.locale, { day: "2-digit", month: "2-digit" })}
              </div>
            </div>
          ))}
          {gunluk.length === 0 && <div style={{ color: t.dim, fontSize: 14 }}>{s.analiz.veriYok}</div>}
        </div>
      </Bolum>

      {/* En çok izlenenler */}
      <Bolum ad={s.analiz.enCok}>
        <div style={{ display: "grid", gap: 8 }}>
          {enCok.map((satir, i) => (
            <div
              key={satir.baslik_ad}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "10px 14px",
                background: t.surface,
                border: `1px solid ${t.line}`,
                borderRadius: 8,
              }}
            >
              <span style={{ color: t.dim, fontSize: 13, width: 22 }}>{i + 1}</span>
              <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{satir.baslik_ad}</span>
              <span style={{ color: t.dim, fontSize: 13 }}>
                {Number(satir.izlenme).toLocaleString(s.locale)} {s.analiz.izlenme}
              </span>
            </div>
          ))}
          {enCok.length === 0 && <div style={{ color: t.dim, fontSize: 14 }}>{s.analiz.veriYok}</div>}
        </div>
      </Bolum>

      {/* Test içeriği yönetimi — is_test true olanlar analizden hariç tutulur (sql/35) */}
      <Bolum ad={s.analiz.testYonetim}>
        <div style={{ color: t.dim, fontSize: 13, marginBottom: 12 }}>{s.analiz.testAcikla}</div>
        <div style={{ display: "grid", gap: 8 }}>
          {basliklar.map((b) => (
            <div
              key={b.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "10px 14px",
                background: t.surface,
                border: `1px solid ${b.is_test ? t.danger : t.line}`,
                borderRadius: 8,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, flex: 1, opacity: b.is_test ? 0.6 : 1 }}>{b.name}</span>
              <button
                onClick={() => testDegis(b.id, !b.is_test)}
                style={{
                  background: b.is_test ? t.danger : "none",
                  color: b.is_test ? "#0A0A0B" : t.dim,
                  border: `1px solid ${b.is_test ? t.danger : t.line}`,
                  borderRadius: 999,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {b.is_test ? "TEST" : "—"}
              </button>
            </div>
          ))}
          {basliklar.length === 0 && <div style={{ color: t.dim, fontSize: 14 }}>{s.analiz.veriYok}</div>}
        </div>
      </Bolum>
    </div>
  );
}

function OzetKart({ etiket, deger, locale }) {
  return (
    <div
      style={{
        background: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: 10,
        padding: "18px 20px",
      }}
    >
      <div style={{ color: t.dim, fontSize: 12, marginBottom: 6 }}>{etiket}</div>
      <div style={{ fontFamily: t.display, fontWeight: 800, fontSize: 24 }}>
        {deger === undefined
          ? "—"
          : Number.isFinite(Number(deger))
            ? Number(deger).toLocaleString(locale)
            : deger}
      </div>
    </div>
  );
}

function Bolum({ ad, children }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 17, marginBottom: 14 }}>
        {ad}
      </div>
      {children}
    </div>
  );
}
