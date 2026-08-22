// Üretici (creator) başvuru ekranı — izleyici video yükleyebilmek için ONAY ister.
// Onaylanınca role='creator' olur; Yükle/Stüdyo sekmeleri açılır (profil tazelenince).
import { useEffect, useState } from "react";
import { getCreatorBasvurum, creatorBasvur, pilotVideoYukle } from "./catalog";
import { useLang } from "./i18n";
import { t } from "./theme";

export default function CreatorBasvuru({ user, girisAc }) {
  const { s } = useLang();
  const u = s.uretici;
  const [durum, setDurum] = useState(undefined); // undefined: yük · null: başvuru yok · {durum,mesaj}
  const [mesaj, setMesaj] = useState("");
  const [dosya, setDosya] = useState(null); // pilot video (opsiyonel)
  const [gonderiliyor, setGonderiliyor] = useState(false);

  useEffect(() => {
    if (!user) return setDurum(null);
    getCreatorBasvurum(user.id).then(setDurum);
  }, [user?.id]);

  async function gonder() {
    setGonderiliyor(true);
    try {
      let pilotUrl = null;
      let pilotPath = null;
      if (dosya) {
        const r = await pilotVideoYukle(user.id, dosya); // 'pilot' bucket → { path, url }
        pilotUrl = r.url;
        pilotPath = r.path;
      }
      const { error } = await creatorBasvur(user.id, mesaj.trim(), pilotUrl, pilotPath);
      if (!error) setDurum({ durum: "beklemede", mesaj: mesaj.trim() });
    } catch {
      /* yükleme/başvuru hatası → durum değişmez, kullanıcı tekrar dener */
    }
    setGonderiliyor(false);
  }

  const kap = { maxWidth: 620, margin: "0 auto", padding: `48px ${t.pad}` };
  const baslik = { fontFamily: t.display, fontWeight: 800, fontSize: 28, marginBottom: 10 };
  const alt = { color: t.dim, fontSize: 15, lineHeight: 1.6, marginBottom: 24 };
  const anaDugme = {
    background: t.gradient, color: "#0A0A0B", border: "none", borderRadius: 8,
    padding: "12px 22px", fontSize: 15, fontWeight: 700, cursor: "pointer",
  };
  const rozet = (renk) => ({
    background: t.surface, border: `1px solid ${renk}`, borderRadius: 10,
    padding: "16px 18px", color: renk, fontSize: 15, fontWeight: 600, lineHeight: 1.5,
  });
  const alan = {
    width: "100%", background: t.surface2, border: `1px solid ${t.line}`, borderRadius: 8,
    color: t.text, fontSize: 14, padding: 12, marginBottom: 14, resize: "vertical",
    fontFamily: "inherit", outline: "none",
  };

  if (!user) {
    return (
      <div style={kap}>
        <div style={baslik}>{u.baslik}</div>
        <p style={alt}>{u.girisGerek}</p>
        <button style={anaDugme} onClick={girisAc}>{s.genel.girisYap}</button>
      </div>
    );
  }
  if (durum === undefined) {
    return <div style={kap}><p style={alt}>{s.genel.yukleniyor}</p></div>;
  }

  const d = durum?.durum;
  return (
    <div style={kap}>
      <div style={baslik}>{u.baslik}</div>
      <p style={alt}>{u.aciklama}</p>

      {d === "beklemede" ? (
        <div style={rozet(t.accent)}>{u.beklemede}</div>
      ) : d === "onaylandi" ? (
        <div style={rozet(t.accent)}>{u.onaylandi}</div>
      ) : (
        <>
          {d === "reddedildi" && (
            <div style={{ ...rozet(t.danger), marginBottom: 16 }}>{u.reddedildi}</div>
          )}
          <textarea
            style={alan}
            placeholder={u.mesajYer}
            value={mesaj}
            onChange={(e) => setMesaj(e.target.value)}
            rows={4}
          />

          {/* Pilot video (opsiyonel) — 'pilot' bucket'ına yüklenir, başvuruya bağlanır */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{u.pilotBaslik}</div>
            <div style={{ color: t.dim, fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>{u.pilotAciklama}</div>
            <label
              style={{
                display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer",
                border: `1px solid ${dosya ? t.accent : t.line}`, borderRadius: 8, padding: "10px 16px",
                fontSize: 14, fontWeight: 600, color: dosya ? t.accent : t.text, background: t.surface2,
              }}
            >
              <input type="file" accept="video/*" style={{ display: "none" }} onChange={(e) => setDosya(e.target.files?.[0] ?? null)} />
              {dosya ? `✓ ${u.pilotSecili}` : `▶ ${u.pilotSec}`}
            </label>
            {dosya && <div style={{ color: t.dim, fontSize: 12, marginTop: 6, wordBreak: "break-all" }}>{dosya.name}</div>}
          </div>

          <button
            style={{ ...anaDugme, opacity: gonderiliyor ? 0.6 : 1 }}
            disabled={gonderiliyor}
            onClick={gonder}
          >
            {gonderiliyor ? s.genel.yukleniyor : d === "reddedildi" ? u.tekrarGonder : u.gonder}
          </button>
        </>
      )}
    </div>
  );
}
