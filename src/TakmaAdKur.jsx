// İlk-kurulum takma ad modalı: display_name_chosen=false olan girişli kullanıcıya, devam
// etmeden önce kendi takma adını seçtirir (e-postadan türetilmiş varsayılan sessizce kalmasın).
// Kapatılamaz (zorunlu adım) — ancak takma ad ayarlanınca (yenile → chosen=true) kaybolur.
import { useState } from "react";
import { takmaAdAyarla, TAKMA_AD_BICIM } from "./auth.js";
import { useLang } from "./i18n";
import { t } from "./theme";

export default function TakmaAdKur({ profile, yenile }) {
  const { s } = useLang();
  // E-postadan türetilmiş varsayılanı başlangıç önerisi olarak koy (kullanıcı düzenler)
  const [ad, setAd] = useState(profile?.display_name ?? "");
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState(null);

  const gecerli = TAKMA_AD_BICIM.test(ad.trim());

  async function gonder(e) {
    e.preventDefault();
    setHata(null);
    setBekliyor(true);
    const sonuc = await takmaAdAyarla(ad.trim(), (s.locale || "en").slice(0, 2));
    setBekliyor(false);
    if (sonuc.hata) {
      setHata(s.profil.takmaAd.hata[sonuc.kod] ?? s.profil.takmaAd.hata.sunucu);
      return;
    }
    yenile(); // profili tazele → display_name_chosen=true → modal kapanır
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.8)",
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
        <div style={{ fontFamily: t.display, fontWeight: 800, fontSize: 22, marginBottom: 4 }}>
          {s.profil.takmaAd.baslik}
        </div>
        <div style={{ color: t.dim, fontSize: 14, marginBottom: 18 }}>{s.profil.takmaAd.aciklama}</div>

        <input
          autoFocus
          value={ad}
          onChange={(e) => setAd(e.target.value)}
          maxLength={20}
          placeholder={s.profil.takmaAd.baslik}
          style={{
            width: "100%",
            padding: "12px 14px",
            background: t.surface2,
            border: `1px solid ${t.line}`,
            borderRadius: 8,
            color: t.text,
            fontSize: 15,
            outline: "none",
            marginBottom: 8,
          }}
        />
        <div style={{ color: t.dim, fontSize: 12, marginBottom: 16 }}>{s.profil.takmaAd.ipucu}</div>

        {hata && <div style={{ color: t.danger, fontSize: 13, marginBottom: 12 }}>{hata}</div>}

        <button
          type="submit"
          disabled={bekliyor || !gecerli}
          style={{
            width: "100%",
            padding: "12px 0",
            background: t.gradient,
            color: "#0A0A0B",
            border: "none",
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 15,
            opacity: bekliyor || !gecerli ? 0.6 : 1,
          }}
        >
          {bekliyor ? s.profil.takmaAd.bekle : s.profil.takmaAd.kaydet}
        </button>
      </form>
    </div>
  );
}
