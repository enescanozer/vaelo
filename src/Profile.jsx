// Profil modalı: görünen adı düzenleme + e-posta doğrulama durumu / yeniden gönderme
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { takmaAdAyarla } from "./auth.js";
import { useLang } from "./i18n";
import { t } from "./theme";

export default function Profile({ user, profile, kapat, yenile }) {
  const { s } = useLang();
  const [ad, setAd] = useState(profile?.display_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [instagram, setInstagram] = useState(profile?.instagram ?? "");
  const [tiktok, setTiktok] = useState(profile?.tiktok ?? "");
  const [youtube, setYoutube] = useState(profile?.youtube ?? "");
  const [twitter, setTwitter] = useState(profile?.twitter ?? "");
  const [website, setWebsite] = useState(profile?.website ?? "");
  // Yalnız üretici/admin sosyal alanları görür (izleyicinin profilinde anlamı yok)
  const uretici = profile?.role === "creator" || profile?.role === "admin";

  // ESC ile kapat
  useEffect(() => {
    const dinle = (e) => e.key === "Escape" && kapat();
    window.addEventListener("keydown", dinle);
    return () => window.removeEventListener("keydown", dinle);
  }, [kapat]);
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState(null);
  const [gonderildi, setGonderildi] = useState(false);

  const dogrulanmis = !!user.email_confirmed_at;

  async function kaydet(e) {
    e.preventDefault();
    setHata(null);
    setBekliyor(true);

    // Takma ad: değiştiyse ya da henüz seçilmemişse edge function'dan (doğrulama+moderasyon+tekillik)
    const yeni = ad.trim();
    if (yeni !== (profile?.display_name ?? "") || !profile?.display_name_chosen) {
      const sonuc = await takmaAdAyarla(yeni, (s.locale || "en").slice(0, 2));
      if (sonuc.hata) {
        setBekliyor(false);
        setHata(s.profil.takmaAd.hata[sonuc.kod] ?? s.profil.takmaAd.hata.sunucu);
        return;
      }
    }

    // Sosyal alanlar (yalnız üretici) — doğrudan update. Boşsa null (ikon gösterilmez).
    if (uretici) {
      const bosNull = (v) => (v.trim() ? v.trim() : null);
      const { error } = await supabase
        .from("profiles")
        .update({
          bio: bosNull(bio),
          instagram: bosNull(instagram),
          tiktok: bosNull(tiktok),
          youtube: bosNull(youtube),
          twitter: bosNull(twitter),
          website: bosNull(website),
        })
        .eq("id", user.id);
      if (error) {
        setBekliyor(false);
        setHata(error.message);
        return;
      }
    }

    setBekliyor(false);
    yenile();
    kapat();
  }

  async function dogrulamaGonder() {
    setHata(null);
    const { error } = await supabase.auth.resend({ type: "signup", email: user.email });
    if (error) setHata(error.message);
    else setGonderildi(true);
  }

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
        onSubmit={kaydet}
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
          {s.profil.baslik}
        </div>

        <label style={{ color: t.dim, fontSize: 13, display: "block", marginBottom: 6 }}>
          {s.profil.gorunenAd}
        </label>
        <input
          value={ad}
          onChange={(e) => setAd(e.target.value)}
          required
          style={{
            width: "100%",
            padding: "12px 14px",
            background: t.surface2,
            border: `1px solid ${t.line}`,
            borderRadius: 8,
            color: t.text,
            fontSize: 15,
            outline: "none",
            marginBottom: 16,
          }}
        />

        {/* Üretici: bio + sosyal medya (profil bazlı, her videosunda görünür) */}
        {uretici && (
          <>
            <label style={{ color: t.dim, fontSize: 13, display: "block", marginBottom: 6 }}>
              {s.profil.bio}
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={2}
              style={{
                width: "100%",
                padding: "10px 14px",
                background: t.surface2,
                border: `1px solid ${t.line}`,
                borderRadius: 8,
                color: t.text,
                fontSize: 14,
                outline: "none",
                marginBottom: 16,
                resize: "vertical",
              }}
            />
            <label style={{ color: t.dim, fontSize: 13, display: "block", marginBottom: 6 }}>
              {s.profil.sosyal}
            </label>
            <div style={{ color: t.dim, fontSize: 12, marginBottom: 8 }}>{s.profil.sosyalIpucu}</div>
            {[
              ["Instagram", instagram, setInstagram],
              ["TikTok", tiktok, setTiktok],
              ["YouTube", youtube, setYoutube],
              ["X (Twitter)", twitter, setTwitter],
              [s.profil.website, website, setWebsite],
            ].map(([etiket, deger, ayarla]) => (
              <input
                key={etiket}
                value={deger}
                onChange={(e) => ayarla(e.target.value)}
                placeholder={etiket}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  background: t.surface2,
                  border: `1px solid ${t.line}`,
                  borderRadius: 8,
                  color: t.text,
                  fontSize: 14,
                  outline: "none",
                  marginBottom: 8,
                }}
              />
            ))}
            <div style={{ height: 8 }} />
          </>
        )}

        {/* E-posta + doğrulama durumu */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            background: t.surface2,
            border: `1px solid ${t.line}`,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis" }}>
              {user.email}
            </div>
            <div style={{ fontSize: 12, color: dogrulanmis ? t.dim : t.danger, marginTop: 2 }}>
              {dogrulanmis ? s.profil.dogrulandi : s.profil.dogrulanmadi}
            </div>
          </div>
          {!dogrulanmis && !gonderildi && (
            <button
              type="button"
              onClick={dogrulamaGonder}
              style={{
                background: "none",
                border: `1px solid ${t.line}`,
                borderRadius: 6,
                color: t.text,
                padding: "6px 10px",
                fontSize: 12,
                whiteSpace: "nowrap",
              }}
            >
              {s.profil.yenidenGonder}
            </button>
          )}
          {gonderildi && <span style={{ color: t.dim, fontSize: 12 }}>{s.profil.gonderildi}</span>}
        </div>

        {hata && <div style={{ color: t.danger, fontSize: 13, marginBottom: 12 }}>{hata}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="submit"
            disabled={bekliyor}
            style={{
              flex: 1,
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
            {s.profil.kaydet}
          </button>
          <button
            type="button"
            onClick={kapat}
            style={{
              padding: "12px 20px",
              background: "none",
              border: `1px solid ${t.line}`,
              borderRadius: 8,
              color: t.dim,
              fontSize: 14,
            }}
          >
            {s.profil.vazgec}
          </button>
        </div>
      </form>
    </div>
  );
}
