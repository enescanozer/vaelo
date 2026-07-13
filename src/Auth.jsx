// Giriş / kayıt modalı
import { useEffect, useState } from "react";
import { signIn, signUp } from "./auth.js";
import { useLang } from "./i18n";
import { t } from "./theme";

export default function Auth({ kapat }) {
  const { s } = useLang();
  const [mod, setMod] = useState("giris"); // "giris" | "kayit"

  // ESC ile kapat
  useEffect(() => {
    const dinle = (e) => e.key === "Escape" && kapat();
    window.addEventListener("keydown", dinle);
    return () => window.removeEventListener("keydown", dinle);
  }, [kapat]);
  const [email, setEmail] = useState("");
  const [sifre, setSifre] = useState("");
  const [ad, setAd] = useState("");
  const [hata, setHata] = useState(null);
  const [mesaj, setMesaj] = useState(null);
  const [bekliyor, setBekliyor] = useState(false);

  async function gonder(e) {
    e.preventDefault();
    setHata(null);
    setMesaj(null);
    setBekliyor(true);
    const { error } =
      mod === "giris" ? await signIn(email, sifre) : await signUp(email, sifre, ad);
    setBekliyor(false);
    if (error) {
      setHata(error.message);
      return;
    }
    if (mod === "kayit") {
      setMesaj(s.giris.kayitAlindi);
    } else {
      kapat();
    }
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
      onClick={kapat}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
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
        <div
          style={{
            fontFamily: t.display,
            fontWeight: 800,
            fontSize: 22,
            marginBottom: 4,
          }}
        >
          {mod === "giris" ? s.giris.girisBaslik : s.giris.kayitBaslik}
        </div>
        <div style={{ color: t.dim, fontSize: 14, marginBottom: 20 }}>
          {mod === "giris" ? s.giris.girisAlt : s.giris.kayitAlt}
        </div>

        {mod === "kayit" && (
          <input
            style={alanStil}
            placeholder={s.giris.ad}
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            required
          />
        )}
        <input
          style={alanStil}
          type="email"
          placeholder={s.giris.eposta}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          style={alanStil}
          type="password"
          placeholder={s.giris.sifre}
          value={sifre}
          onChange={(e) => setSifre(e.target.value)}
          minLength={6}
          required
        />

        {hata && (
          <div style={{ color: t.danger, fontSize: 13, marginBottom: 12 }}>{hata}</div>
        )}
        {mesaj && (
          <div style={{ color: t.text, fontSize: 13, marginBottom: 12 }}>{mesaj}</div>
        )}

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
          {bekliyor
            ? s.giris.bekle
            : mod === "giris"
              ? s.genel.girisYap
              : s.giris.kayitOl}
        </button>

        <div style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: t.dim }}>
          {mod === "giris" ? (
            <>
              {s.giris.hesapYok}{" "}
              <button
                type="button"
                onClick={() => setMod("kayit")}
                style={{
                  background: "none",
                  border: "none",
                  color: t.text,
                  fontSize: 13,
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                {s.giris.kayitOl}
              </button>
            </>
          ) : (
            <>
              {s.giris.hesapVar}{" "}
              <button
                type="button"
                onClick={() => setMod("giris")}
                style={{
                  background: "none",
                  border: "none",
                  color: t.text,
                  fontSize: 13,
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                {s.genel.girisYap}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
