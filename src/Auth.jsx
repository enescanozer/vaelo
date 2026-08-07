// Giriş / kayıt / şifre sıfırlama modalı
import { useEffect, useState } from "react";
import { signIn, signUp, signInWithGoogle, sifreSifirla } from "./auth.js";
import { useLang } from "./i18n";
import { t } from "./theme";

export default function Auth({ kapat }) {
  const { s } = useLang();
  const [mod, setMod] = useState("giris"); // "giris" | "kayit" | "sifirla"

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

  // Mod değişince mesaj/hata sıfırlanır
  function modDegis(yeni) {
    setMod(yeni);
    setHata(null);
    setMesaj(null);
  }

  async function gonder(e) {
    e.preventDefault();
    setHata(null);
    setMesaj(null);
    setBekliyor(true);

    // Şifre sıfırlama: yalnız e-posta ister, Supabase bağlantı e-postası yollar
    if (mod === "sifirla") {
      const { error } = await sifreSifirla(email);
      setBekliyor(false);
      if (error) return setHata(error.message);
      return setMesaj(s.giris.sifirlaGitti);
    }

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

  async function googleGiris() {
    setHata(null);
    // Google'a yönlendirir; hata yalnızca yapılandırma eksikse döner
    const { error } = await signInWithGoogle();
    if (error) setHata(s.giris.googleHata(error.message));
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
  const baglantiStil = {
    background: "none",
    border: "none",
    color: t.text,
    fontSize: 13,
    padding: 0,
    textDecoration: "underline",
    cursor: "pointer",
  };

  const sifirla = mod === "sifirla";
  const baslik = sifirla ? s.giris.sifirlaBaslik : mod === "giris" ? s.giris.girisBaslik : s.giris.kayitBaslik;
  const alt = sifirla ? s.giris.sifirlaAlt : mod === "giris" ? s.giris.girisAlt : s.giris.kayitAlt;

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
        <div style={{ fontFamily: t.display, fontWeight: 800, fontSize: 22, marginBottom: 4 }}>
          {baslik}
        </div>
        <div style={{ color: t.dim, fontSize: 14, marginBottom: 20 }}>{alt}</div>

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
        {!sifirla && (
          <input
            style={alanStil}
            type="password"
            placeholder={s.giris.sifre}
            value={sifre}
            onChange={(e) => setSifre(e.target.value)}
            minLength={6}
            required
          />
        )}

        {hata && <div style={{ color: t.danger, fontSize: 13, marginBottom: 12 }}>{hata}</div>}
        {mesaj && <div style={{ color: t.text, fontSize: 13, marginBottom: 12 }}>{mesaj}</div>}

        <button
          type="submit"
          disabled={bekliyor}
          style={{
            width: "100%",
            padding: "12px 0",
            background: t.gradient,
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
            : sifirla
              ? s.giris.sifirlaGonder
              : mod === "giris"
                ? s.genel.girisYap
                : s.giris.kayitOl}
        </button>

        {/* Şifremi unuttum — yalnız giriş modunda */}
        {mod === "giris" && (
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <button type="button" onClick={() => modDegis("sifirla")} style={{ ...baglantiStil, color: t.dim }}>
              {s.giris.sifremiUnuttum}
            </button>
          </div>
        )}

        {/* "veya" + Google — sıfırlama modunda gizli */}
        {!sifirla && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0" }}>
              <div style={{ flex: 1, height: 1, background: t.line }} />
              <span style={{ color: t.dim, fontSize: 12 }}>{s.giris.veya}</span>
              <div style={{ flex: 1, height: 1, background: t.line }} />
            </div>

            <button
              type="button"
              onClick={googleGiris}
              style={{
                width: "100%",
                padding: "11px 0",
                background: t.surface2,
                color: t.text,
                border: `1px solid ${t.line}`,
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
            >
              {/* Google G logosu (inline SVG — dış istek yok) */}
              <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              {s.giris.googleIle}
            </button>
          </>
        )}

        <div style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: t.dim }}>
          {sifirla ? (
            <button type="button" onClick={() => modDegis("giris")} style={baglantiStil}>
              {s.giris.giriseDon}
            </button>
          ) : mod === "giris" ? (
            <>
              {s.giris.hesapYok}{" "}
              <button type="button" onClick={() => modDegis("kayit")} style={baglantiStil}>
                {s.giris.kayitOl}
              </button>
            </>
          ) : (
            <>
              {s.giris.hesapVar}{" "}
              <button type="button" onClick={() => modDegis("giris")} style={baglantiStil}>
                {s.genel.girisYap}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
