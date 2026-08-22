// Yarışma ekranı: lider vitrini + oy payı çubuklu sıralama listesi.
// Yarışma bir edinim/lansman taktiğidir; yarışma yoksa ekran sade bir mesaj gösterir.
// Süresi bitince salt-sonuç görünümü (oy/katılım kapanır, sıralama kalır).
import { useEffect, useState } from "react";
import {
  getYarismaVerisi,
  yarismaTazele,
  getContestResults,
  voteContest,
  enterContest,
  toCard,
  turAdi,
} from "./catalog";
import { useLang } from "./i18n";
import { t } from "./theme";

export default function Contest({ user, izle, girisAc }) {
  const { s } = useLang();
  const [yarisma, setYarisma] = useState(undefined); // undefined: yükleniyor, null: yok
  const [girisler, setGirisler] = useState([]);
  const [oylar, setOylar] = useState(new Map());
  const [benimOyum, setBenimOyum] = useState(null);
  const [basliklarim, setBasliklarim] = useState([]);
  const [secili, setSecili] = useState("");
  const [hata, setHata] = useState(null);

  // Tek önbellekli çağrı: sekmeye her girişte 3-5 istek yerine 30 sn önbellek
  async function yukle() {
    const v = await getYarismaVerisi(user?.id);
    setYarisma(v.yarisma ?? null);
    setGirisler(v.girisler);
    setOylar(v.oylar);
    setBenimOyum(v.benimOyum);
    setBasliklarim(v.basliklarim);
  }

  useEffect(() => {
    yukle().catch((e) => setHata(e.message));
  }, [user?.id]);

  async function oyVer(titleId) {
    if (!user) {
      girisAc();
      return;
    }
    setBenimOyum(titleId); // iyimser güncelleme
    await voteContest(yarisma.id, user.id, titleId);
    yarismaTazele(); // oy sayıları değişti — önbelleği geçersiz kıl
    getContestResults(yarisma.id).then(setOylar);
  }

  async function katil(e) {
    e.preventDefault();
    if (!secili) return;
    setHata(null);
    const { error } = await enterContest(yarisma.id, secili);
    if (error) setHata(error.message);
    else {
      setSecili("");
      yarismaTazele(); // yeni katılım — önbelleği geçersiz kıl
      yukle();
    }
  }

  if (yarisma === undefined) {
    return (
      <div style={{ padding: `80px ${t.pad}`, textAlign: "center", color: t.dim, fontSize: 15 }}>
        {s.genel.yukleniyor}
      </div>
    );
  }

  if (yarisma === null) {
    return (
      <div style={{ padding: `80px ${t.pad}`, textAlign: "center", color: t.dim, fontSize: 15 }}>
        {s.yarisma.yok}
      </div>
    );
  }

  const kalanGun = yarisma.ends_at
    ? Math.max(0, Math.ceil((new Date(yarisma.ends_at) - Date.now()) / 86400000))
    : null;
  const bitti = yarisma.ends_at ? new Date(yarisma.ends_at) <= Date.now() : false;

  const katilabilir = basliklarim.filter((b) => !girisler.some((g) => g.id === b.id));
  const sirali = [...girisler].sort(
    (a, b) => (oylar.get(b.id) ?? 0) - (oylar.get(a.id) ?? 0)
  );
  const toplamOy = [...oylar.values()].reduce((a, b) => a + b, 0);
  const lider = sirali[0];
  const digerleri = sirali.slice(1);
  const enCokOy = Math.max(1, oylar.get(lider?.id) ?? 0);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: t.pad }}>
      <div style={{ color: t.dim, fontSize: 13, letterSpacing: 2, marginBottom: 8 }}>
        {s.yarisma.etiket}
      </div>
      <div
        style={{
          fontFamily: t.display,
          fontWeight: 800,
          fontSize: "clamp(26px, 5vw, 34px)",
          marginBottom: 10,
        }}
      >
        {yarisma.name}
      </div>
      {yarisma.description && (
        <div style={{ color: t.dim, fontSize: 15, lineHeight: 1.6, maxWidth: 640, marginBottom: 12 }}>
          {yarisma.description}
        </div>
      )}

      {/* Meta satırı: kalan süre · katılımcı · toplam oy */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", color: t.dim, fontSize: 13 }}>
        {kalanGun !== null && (
          <span style={{ color: bitti ? t.dim : t.text }}>
            {bitti ? s.yarisma.bitti : s.yarisma.kalan(kalanGun)}
          </span>
        )}
        {kalanGun !== null && <span style={{ color: t.line }}>·</span>}
        <span>{s.yarisma.katilimci(sirali.length)}</span>
        <span style={{ color: t.line }}>·</span>
        <span>{s.yarisma.toplamOy(toplamOy)}</span>
      </div>

      {hata && <div style={{ color: t.danger, fontSize: 13, marginTop: 10 }}>{hata}</div>}

      {/* Üretici katılımı (yalnızca yarışma sürerken) */}
      {user && !bitti && katilabilir.length > 0 && (
        <form onSubmit={katil} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 20 }}>
          <select
            value={secili}
            onChange={(e) => setSecili(e.target.value)}
            style={{
              padding: "10px 14px",
              background: t.surface2,
              border: `1px solid ${t.line}`,
              borderRadius: 8,
              color: t.text,
              fontSize: 14,
              outline: "none",
              minWidth: 240,
            }}
          >
            <option value="">{s.yarisma.sec}</option>
            {katilabilir.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!secili}
            style={{
              background: t.gradient,
              color: "#0A0A0B",
              border: "none",
              borderRadius: 8,
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 700,
              opacity: secili ? 1 : 0.5,
            }}
          >
            {s.yarisma.katil}
          </button>
        </form>
      )}

      {sirali.length === 0 && (
        <div style={{ color: t.dim, fontSize: 14, padding: "32px 0" }}>{s.yarisma.girisYok}</div>
      )}

      {/* Lider vitrini */}
      {lider && (
        <div
          className="kart"
          onClick={() => izle(lider.id)}
          style={{
            display: "flex",
            gap: 20,
            flexWrap: "wrap",
            marginTop: 28,
            padding: 20,
            background: t.surface,
            border: `1px solid ${benimOyum === lider.id ? t.accent : t.line}`,
            borderRadius: 12,
            cursor: "pointer",
          }}
        >
          <Kapak baslik={lider} genis />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div
              style={{ color: t.accent, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}
            >
              {s.yarisma.onde}
            </div>
            <div style={{ fontFamily: t.display, fontWeight: 800, fontSize: 24, margin: "6px 0 2px" }}>
              {lider.name}
            </div>
            <div style={{ color: t.dim, fontSize: 13 }}>
              {[turAdi(lider.kind, s), lider.genre]
                .filter(Boolean)
                .join(" · ")}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
              <span style={{ fontFamily: t.display, fontWeight: 800, fontSize: 22 }}>
                {s.yarisma.oy(oylar.get(lider.id) ?? 0)}
              </span>
              {!bitti && (
                <OyDugme
                  oyum={benimOyum === lider.id}
                  s={s}
                  tikla={() => oyVer(lider.id)}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sıralama listesi: oy payı çubuğu lidere göre */}
      <div style={{ marginTop: 12 }}>
        {digerleri.map((baslik, sira) => {
          const oySayisi = oylar.get(baslik.id) ?? 0;
          const oyum = benimOyum === baslik.id;
          return (
            <div
              key={baslik.id}
              onClick={() => izle(baslik.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 16px",
                marginTop: 10,
                background: t.surface,
                border: `1px solid ${oyum ? t.accent : t.line}`,
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              <span style={{ color: t.dim, fontSize: 13, width: 26, flexShrink: 0 }}>
                #{sira + 2}
              </span>
              <Kapak baslik={baslik} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {baslik.name}
                </div>
                {/* Oy payı çubuğu (lidere oranla) */}
                <div
                  style={{
                    height: 4,
                    background: t.surface2,
                    borderRadius: 2,
                    marginTop: 8,
                    maxWidth: 280,
                  }}
                >
                  <div
                    style={{
                      width: `${(oySayisi / enCokOy) * 100}%`,
                      height: "100%",
                      background: t.gradient,
                      borderRadius: 2,
                      opacity: 0.85,
                    }}
                  />
                </div>
              </div>
              <span style={{ color: t.dim, fontSize: 13, whiteSpace: "nowrap" }}>
                {s.yarisma.oy(oySayisi)}
              </span>
              {!bitti && (
                <OyDugme oyum={oyum} s={s} tikla={() => oyVer(baslik.id)} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Oy düğmesi — satır tıklaması detaya gittiği için yayılımı durdurur
function OyDugme({ oyum, s, tikla }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        tikla();
      }}
      style={{
        background: oyum ? t.gradient : "none",
        color: oyum ? "#0A0A0B" : t.text,
        border: oyum ? "none" : `1px solid ${t.line}`,
        borderRadius: 6,
        padding: "6px 14px",
        fontSize: 12,
        fontWeight: oyum ? 700 : 400,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {oyum ? s.yarisma.oyun : s.yarisma.oyVer}
    </button>
  );
}

// Kapak: harf yedeği + tembel yüklenen görsel (kırıkta kendini gizler)
function Kapak({ baslik, genis }) {
  const kapak = toCard(baslik).kapak;
  const boyut = genis ? { width: 220, height: 124 } : { width: 86, height: 48 };
  return (
    <div
      style={{
        ...boyut,
        borderRadius: 8,
        overflow: "hidden",
        position: "relative",
        background: t.surface2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontFamily: t.display,
          fontWeight: 800,
          fontSize: genis ? 30 : 18,
          color: t.line,
        }}
      >
        {baslik.name?.[0]?.toUpperCase()}
      </span>
      {kapak && (
        <img
          src={kapak}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      )}
    </div>
  );
}
