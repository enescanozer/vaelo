// "Yeni şifre belirle" modalı — şifre sıfırlama bağlantısından dönen kullanıcı için.
// App.jsx bunu PASSWORD_RECOVERY olayında açar; updateUser ile yeni şifre kaydedilir.
import { useEffect, useState } from "react";
import { sifreGuncelle } from "./auth.js";
import { useLang } from "./i18n";
import { t } from "./theme";

export default function SifreYenile({ kapat }) {
  const { s } = useLang();
  const [sifre, setSifre] = useState("");
  const [hata, setHata] = useState(null);
  const [mesaj, setMesaj] = useState(null);
  const [bekliyor, setBekliyor] = useState(false);

  // ESC ile kapat
  useEffect(() => {
    const dinle = (e) => e.key === "Escape" && kapat();
    window.addEventListener("keydown", dinle);
    return () => window.removeEventListener("keydown", dinle);
  }, [kapat]);

  async function gonder(e) {
    e.preventDefault();
    setHata(null);
    setBekliyor(true);
    const { error } = await sifreGuncelle(sifre);
    setBekliyor(false);
    if (error) return setHata(error.message);
    setMesaj(s.giris.sifreGuncellendi);
    // Kullanıcı mesajı görsün diye kısa gecikmeyle kapat (artık yeni şifreyle girmiş durumda)
    setTimeout(kapat, 1500);
  }

  const alanStil = {
    width: "100%",
    padding: "12px 14px",
    background: t.surface2,
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    color: t.text,
    fontSize: 15,
    outline: "none",
    marginBottom: 12,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
      }}
    >
      <form
        onSubmit={gonder}
        style={{
          width: 380,
          maxWidth: "92vw",
          background: t.surface,
          border: `1px solid ${t.line}`,
          borderRadius: 12,
          padding: 28,
        }}
      >
        <div style={{ fontFamily: t.display, fontWeight: 800, fontSize: 22, marginBottom: 20 }}>
          {s.giris.yeniSifreBaslik}
        </div>

        <input
          style={alanStil}
          type="password"
          placeholder={s.giris.yeniSifre}
          value={sifre}
          onChange={(e) => setSifre(e.target.value)}
          minLength={6}
          required
          autoFocus
        />

        {hata && <div style={{ color: t.danger, fontSize: 13, marginBottom: 12 }}>{hata}</div>}
        {mesaj && <div style={{ color: t.text, fontSize: 13, marginBottom: 12 }}>{mesaj}</div>}

        <button
          type="submit"
          disabled={bekliyor}
          style={{
            width: "100%",
            padding: "12px 0",
            background: t.accent,
            color: "#0A0A0B",
            border: "none",
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 15,
            opacity: bekliyor ? 0.6 : 1,
          }}
        >
          {bekliyor ? s.giris.bekle : s.giris.sifreKaydet}
        </button>
      </form>
    </div>
  );
}
