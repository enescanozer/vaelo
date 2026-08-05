// Ayarlar modalı: arayüz dili + alt yazı tercihleri (otomatik göster, dil).
// Dil i18n'den, alt yazı tercihi ayarlar bağlamından okunur/yazılır.
// (Dosya adı AyarlarModal — ayarlar.jsx bağlam dosyasıyla Windows'ta çakışmasın.)
import { useEffect } from "react";
import { useLang, METINLER } from "./i18n";
import { useAyarlar } from "./ayarlar";
import { t } from "./theme";

// Dil kodu → yerel ad (seçicilerde okunur görünsün)
const DIL_ADI = {
  en: "English", tr: "Türkçe", es: "Español", de: "Deutsch", fr: "Français",
  ru: "Русский", ar: "العربية", zh: "中文",
};

export default function AyarlarModal({ kapat }) {
  const { s, dil, setDil } = useLang();
  const { ayarlar, ayarla } = useAyarlar();

  // ESC ile kapat
  useEffect(() => {
    const dinle = (e) => e.key === "Escape" && kapat();
    window.addEventListener("keydown", dinle);
    return () => window.removeEventListener("keydown", dinle);
  }, [kapat]);

  const a = s.ayarlar;
  const secStil = {
    width: "100%",
    padding: "10px 12px",
    background: t.surface2,
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    color: t.text,
    fontSize: 14,
    outline: "none",
  };

  return (
    <div
      onClick={kapat}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 400,
          maxWidth: "100%",
          background: t.surface,
          border: `1px solid ${t.line}`,
          borderRadius: 12,
          padding: 28,
        }}
      >
        <div style={{ fontFamily: t.display, fontWeight: 800, fontSize: 22, marginBottom: 22 }}>
          {a.baslik}
        </div>

        {/* Dil */}
        <label style={{ color: t.dim, fontSize: 13, display: "block", marginBottom: 6 }}>
          {a.dilBolum}
        </label>
        <select
          style={{ ...secStil, marginBottom: 22 }}
          value={dil}
          onChange={(e) => setDil(e.target.value)}
        >
          {Object.keys(METINLER).map((kod) => (
            <option key={kod} value={kod}>
              {DIL_ADI[kod] ?? kod.toUpperCase()}
            </option>
          ))}
        </select>

        {/* Alt yazı: otomatik göster */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <span style={{ fontSize: 14 }}>{a.altyaziAcik}</span>
          <button
            role="switch"
            aria-checked={ayarlar.altyaziAcik}
            onClick={() => ayarla({ altyaziAcik: !ayarlar.altyaziAcik })}
            style={{
              width: 44,
              height: 26,
              borderRadius: 13,
              border: "none",
              padding: 3,
              cursor: "pointer",
              background: ayarlar.altyaziAcik ? t.accent : t.line,
              display: "flex",
              justifyContent: ayarlar.altyaziAcik ? "flex-end" : "flex-start",
              transition: "background .15s",
            }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                background: ayarlar.altyaziAcik ? "#0A0A0B" : t.surface2,
                display: "block",
              }}
            />
          </button>
        </div>

        {/* Alt yazı dili (yalnızca otomatik açıkken) */}
        {ayarlar.altyaziAcik && (
          <>
            <label style={{ color: t.dim, fontSize: 13, display: "block", marginBottom: 6 }}>
              {a.altyaziDil}
            </label>
            <select
              style={secStil}
              value={ayarlar.altyaziDil}
              onChange={(e) => ayarla({ altyaziDil: e.target.value })}
            >
              <option value="">{a.arayuzDili}</option>
              {Object.keys(METINLER).map((kod) => (
                <option key={kod} value={kod}>
                  {DIL_ADI[kod] ?? kod.toUpperCase()}
                </option>
              ))}
            </select>
          </>
        )}

        <div style={{ color: t.dim, fontSize: 12, lineHeight: 1.5, margin: "16px 0 20px" }}>
          {a.not}
        </div>

        <button
          onClick={kapat}
          style={{
            width: "100%",
            padding: "12px 0",
            background: t.accent,
            color: "#0A0A0B",
            border: "none",
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          {a.kapat}
        </button>
      </div>
    </div>
  );
}
