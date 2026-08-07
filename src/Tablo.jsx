// "Tablo" — haftalık AI görsel yarışması. Haftanın durumuna göre üç görünüm:
// gonderim (eser yükle) · eleme (ANONİM oylama) · sergi (son 50, sahipli, sıralı).
// Admin, haftayı yönetir (başlat / oylamayı aç / tur ilerlet / sergiye al).
import { useEffect, useState } from "react";
import {
  getBuHafta,
  getSergi,
  getOySeti,
  artOyVer,
  getBenimEserim,
  eserGonder,
  getAktifSayi,
  artHaftaBaslat,
  artElemeBaslat,
  artSonrakiTur,
  artSergiyeAl,
  artHaftaBitir,
  artBildir,
  artKaldir,
  getRaporSayilari,
  getAiRiskleri,
} from "./sanat";
import { useLang } from "./i18n";
import { t } from "./theme";

export default function Tablo({ user, admin, moderator, girisAc }) {
  const { s } = useLang();
  const a = s.art;
  const [hafta, setHafta] = useState(undefined); // undefined: yük, null: yok
  const [hata, setHata] = useState(null);

  async function yukle() {
    try {
      setHafta(await getBuHafta());
    } catch (e) {
      setHata(e.message);
    }
  }
  useEffect(() => {
    yukle();
  }, []);

  if (hafta === undefined) {
    return <Durum mesaj={s.genel.yukleniyor} />;
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: t.pad }}>
      <div style={{ color: t.dim, fontSize: 13, letterSpacing: 2, marginBottom: 20 }}>
        {a.etiket}
      </div>

      {admin && <AdminKontrol a={a} hafta={hafta} yenile={yukle} />}

      {hata && <div style={{ color: t.danger, fontSize: 13, marginBottom: 12 }}>{hata}</div>}

      {!hafta && <Durum mesaj={a.yok} />}
      {hafta?.durum === "gonderim" && (
        <Gonderim a={a} hafta={hafta} user={user} girisAc={girisAc} />
      )}
      {hafta?.durum === "eleme" && (
        <Eleme a={a} hafta={hafta} user={user} moderator={moderator} girisAc={girisAc} />
      )}
      {hafta?.durum === "sergi" && (
        <Sergi a={a} hafta={hafta} user={user} moderator={moderator} girisAc={girisAc} />
      )}
    </div>
  );
}

// ————— Gönderim: haftada 1 eser yükle —————
function Gonderim({ a, hafta, user, girisAc }) {
  const [benim, setBenim] = useState(null);
  const [dosya, setDosya] = useState(null);
  const [onizleme, setOnizleme] = useState(null);
  const [aciklama, setAciklama] = useState("");
  const [sosyal, setSosyal] = useState("");
  const [asama, setAsama] = useState("hazir"); // hazir | yukleniyor | bitti
  const [hata, setHata] = useState(null);

  useEffect(() => {
    if (user) getBenimEserim(hafta.id).then(setBenim);
    else setBenim(null);
  }, [user?.id, hafta.id]);

  function dosyaSec(e) {
    const f = e.target.files?.[0];
    setDosya(f ?? null);
    setOnizleme(f ? URL.createObjectURL(f) : null);
  }

  async function gonder() {
    if (!user) return girisAc();
    if (!dosya) return;
    setHata(null);
    setAsama("yukleniyor");
    try {
      const guvenli = guvenliUrl(sosyal);
      const linkler = guvenli ? [{ url: guvenli }] : [];
      await eserGonder(hafta.id, user.id, dosya, aciklama, linkler);
      setAsama("bitti");
      getBenimEserim(hafta.id).then(setBenim);
    } catch (e) {
      setHata(a.gonderHata(e.message));
      setAsama("hazir");
    }
  }

  return (
    <div>
      <h2 style={s2.baslik}>{a.gonderimBaslik}</h2>
      <p style={s2.alt}>{a.gonderimAlt}</p>

      {benim ? (
        <div style={s2.kutu}>
          <img src={benim.url} alt="" style={s2.onizleme} />
          <div style={{ color: t.accent, fontSize: 14, fontWeight: 600, marginTop: 12 }}>
            {a.zatenGonderdin}
          </div>
        </div>
      ) : !user ? (
        <button style={s2.anaDugme} onClick={girisAc}>
          {a.girisGerek}
        </button>
      ) : asama === "bitti" ? (
        <div style={{ color: t.accent, fontSize: 15, padding: "24px 0" }}>{a.gonderildi}</div>
      ) : (
        <div style={{ display: "grid", gap: 12, maxWidth: 460 }}>
          <label style={s2.dosyaKutu}>
            {onizleme ? (
              <img src={onizleme} alt="" style={s2.onizleme} />
            ) : (
              <span style={{ color: t.dim, fontSize: 14 }}>{a.eserSec}</span>
            )}
            <input type="file" accept="image/*" onChange={dosyaSec} style={{ display: "none" }} />
          </label>
          <textarea
            style={{ ...s2.alan, minHeight: 60, resize: "vertical" }}
            placeholder={a.aciklamaYer}
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
          />
          <input
            style={s2.alan}
            placeholder={a.sosyalYer}
            value={sosyal}
            onChange={(e) => setSosyal(e.target.value)}
          />
          {hata && <div style={{ color: t.danger, fontSize: 13 }}>{hata}</div>}
          <button
            style={{ ...s2.anaDugme, opacity: dosya && asama !== "yukleniyor" ? 1 : 0.5 }}
            disabled={!dosya || asama === "yukleniyor"}
            onClick={gonder}
          >
            {asama === "yukleniyor" ? a.gonderBekle : a.gonder}
          </button>
        </div>
      )}
    </div>
  );
}

// ————— Moderasyon düğmeleri: izleyici "bildir", admin "kaldır" —————
function ModDugmeler({ a, user, moderator, pieceId, raporSayi, aiRisk, onKaldir }) {
  const [bildirildi, setBildirildi] = useState(false);
  const [kaldirildi, setKaldirildi] = useState(false);

  async function bildir() {
    if (!user) return;
    setBildirildi(true); // iyimser
    await artBildir(pieceId, user.id);
  }
  async function kaldir() {
    setKaldirildi(true);
    await artKaldir(pieceId);
    onKaldir?.(pieceId);
  }
  if (kaldirildi) {
    return <span style={{ color: t.dim, fontSize: 12 }}>{a.kaldirildi}</span>;
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
      <button
        style={s2.modDugme}
        disabled={bildirildi || !user}
        onClick={bildir}
        title={a.bildir}
      >
        {bildirildi ? a.bildirildi : a.bildir}
      </button>
      {moderator && (
        <>
          {aiRisk && (
            <span
              title={aiRisk.ozet || ""}
              style={{
                fontSize: 12,
                color: aiRisk.risk === "high" ? t.danger : aiRisk.risk === "medium" ? t.text : t.dim,
                border: `1px solid ${aiRisk.risk === "high" ? t.danger : t.line}`,
                borderRadius: 6,
                padding: "2px 7px",
              }}
            >
              {a.aiRisk[aiRisk.risk] ?? aiRisk.risk}
            </span>
          )}
          {raporSayi > 0 && (
            <span style={{ color: t.danger, fontSize: 12 }}>{a.raporVar(raporSayi)}</span>
          )}
          <button style={{ ...s2.modDugme, color: t.danger, borderColor: t.danger }} onClick={kaldir}>
            {a.kaldir}
          </button>
        </>
      )}
    </div>
  );
}

// ————— Eleme: anonim oylama seti —————
function Eleme({ a, hafta, user, moderator, girisAc }) {
  const [set, setSet] = useState(null);
  const [oylanan, setOylanan] = useState(new Set());
  const [riskler, setRiskler] = useState({});

  async function setYukle() {
    if (!user) {
      setSet([]);
      return;
    }
    const liste = await getOySeti(hafta.id, 10);
    setSet(liste);
    setOylanan(new Set());
    // Moderatör/admin ise setteki eserlerin AI risk işaretlerini çek
    if (moderator && liste.length) {
      getAiRiskleri(liste.map((e) => e.id)).then(setRiskler).catch(() => {});
    }
  }
  useEffect(() => {
    setYukle();
  }, [user?.id, hafta.id]);

  async function oyla(pieceId) {
    setOylanan((e) => new Set(e).add(pieceId)); // iyimser
    await artOyVer(pieceId, user.id, hafta.tur);
  }

  if (!user) {
    return (
      <>
        <h2 style={s2.baslik}>{a.elemeBaslik(hafta.tur)}</h2>
        <button style={s2.anaDugme} onClick={girisAc}>
          {a.girisGerek}
        </button>
      </>
    );
  }
  if (set === null) return <Durum mesaj="…" />;

  const kalan = set.filter((e) => !oylanan.has(e.id));

  return (
    <div>
      <h2 style={s2.baslik}>{a.elemeBaslik(hafta.tur)}</h2>
      <p style={s2.alt}>{a.elemeAlt}</p>

      {kalan.length === 0 ? (
        <div style={{ padding: "32px 0" }}>
          <div style={{ color: t.dim, fontSize: 15, marginBottom: 16 }}>{a.setBitti}</div>
          <button style={s2.anaDugme} onClick={setYukle}>
            {a.sonrakiTur} ↻
          </button>
        </div>
      ) : (
        <div style={s2.izgara}>
          {set.map((eser) => {
            const oyVerildi = oylanan.has(eser.id);
            return (
              <div key={eser.id} style={{ opacity: oyVerildi ? 0.5 : 1, transition: "opacity .2s" }}>
                <div style={s2.gorselKutu}>
                  <img src={eser.url} alt="" loading="lazy" style={s2.gorsel} />
                </div>
                <button
                  style={{
                    ...s2.oyDugme,
                    background: oyVerildi ? t.gradient : "none",
                    color: oyVerildi ? "#0A0A0B" : t.text,
                    borderColor: oyVerildi ? t.accent : t.line,
                  }}
                  disabled={oyVerildi}
                  onClick={() => oyla(eser.id)}
                >
                  {oyVerildi ? a.oylandi : a.oyla}
                </button>
                <ModDugmeler
                  a={a}
                  user={user}
                  moderator={moderator}
                  pieceId={eser.id}
                  aiRisk={riskler[eser.id]}
                  onKaldir={(id) => setSet((e) => e.filter((x) => x.id !== id))}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ————— Sergi: son 50, sahipli, sıralı, puanlanabilir —————
function Sergi({ a, hafta, user, moderator, girisAc }) {
  const [eserler, setEserler] = useState(null);
  const [oylanan, setOylanan] = useState(new Set());
  const [raporlar, setRaporlar] = useState({});
  const [riskler, setRiskler] = useState({});

  useEffect(() => {
    getSergi(hafta.id).then((liste) => {
      setEserler(liste);
      // Moderatör/admin ise rapor sayıları + AI risk işaretlerini çek
      if (moderator && liste?.length) {
        const idler = liste.map((e) => e.id);
        getRaporSayilari(idler).then(setRaporlar).catch(() => {});
        getAiRiskleri(idler).then(setRiskler).catch(() => {});
      }
    });
  }, [hafta.id, moderator]);

  async function puanla(pieceId) {
    if (!user) return girisAc();
    setOylanan((e) => new Set(e).add(pieceId));
    await artOyVer(pieceId, user.id, 999); // sergi puanı ayrı "tur"
  }

  if (eserler === null) return <Durum mesaj={s2._yuk} />;

  return (
    <div>
      <h2 style={s2.baslik}>{a.sergiBaslik}</h2>
      <p style={s2.alt}>{a.sergiAlt}</p>
      <div style={s2.izgara}>
        {eserler.map((eser, i) => {
          const oyVerildi = oylanan.has(eser.id);
          const linkler = Array.isArray(eser.sosyal) ? eser.sosyal : [];
          return (
            <div key={eser.id} style={s2.sergiKart}>
              <div style={s2.gorselKutu}>
                <img src={eser.url} alt="" loading="lazy" style={s2.gorsel} />
                <span style={s2.sira}>#{i + 1}</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600 }}>
                {eser.sahip_ad || a.anonim}
              </div>
              {eser.aciklama && (
                <div style={{ color: t.dim, fontSize: 13, marginTop: 2 }}>{eser.aciklama}</div>
              )}
              {linkler.length > 0 && (
                <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                  {linkler.map((l, j) => {
                    const gu = guvenliUrl(l.url); // güvenli değilse link değil, düz metin
                    return gu ? (
                      <a
                        key={j}
                        href={gu}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: t.accent, fontSize: 12 }}
                      >
                        ↗ {kisaLink(gu)}
                      </a>
                    ) : (
                      <span key={j} style={{ color: t.dim, fontSize: 12 }}>
                        ↗ {kisaLink(l.url)}
                      </span>
                    );
                  })}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                <span style={{ color: t.dim, fontSize: 13 }}>{a.oySay(Number(eser.oy))}</span>
                <button
                  style={{
                    ...s2.oyDugme,
                    padding: "5px 12px",
                    background: oyVerildi ? t.gradient : "none",
                    color: oyVerildi ? "#0A0A0B" : t.text,
                    borderColor: oyVerildi ? t.accent : t.line,
                  }}
                  disabled={oyVerildi}
                  onClick={() => puanla(eser.id)}
                >
                  {oyVerildi ? a.oylandi : a.oyla}
                </button>
              </div>
              <ModDugmeler
                a={a}
                user={user}
                moderator={moderator}
                pieceId={eser.id}
                raporSayi={raporlar[eser.id] ?? 0}
                aiRisk={riskler[eser.id]}
                onKaldir={(id) => setEserler((e) => e.filter((x) => x.id !== id))}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ————— Admin: hafta yönetimi —————
function AdminKontrol({ a, hafta, yenile }) {
  const [kalan, setKalan] = useState(null);
  const [hedef, setHedef] = useState(50);
  const [islemde, setIslemde] = useState(false);

  useEffect(() => {
    if (hafta?.durum === "eleme") getAktifSayi(hafta.id).then(setKalan);
    else setKalan(null);
  }, [hafta?.id, hafta?.durum, hafta?.tur]);

  async function calistir(fn) {
    setIslemde(true);
    await fn();
    setIslemde(false);
    yenile();
  }

  return (
    <div
      style={{
        background: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: 10,
        padding: 16,
        marginBottom: 24,
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <span style={{ color: t.dim, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
        {a.adminBaslik}
      </span>
      {kalan != null && (
        <span style={{ color: t.dim, fontSize: 13 }}>· {a.kalanEser(kalan)}</span>
      )}
      <div style={{ flex: 1 }} />

      {!hafta && (
        <AdminDugme
          islemde={islemde}
          onClick={() => calistir(() => artHaftaBaslat(Date.now() % 100000))}
        >
          {a.haftaBaslat}
        </AdminDugme>
      )}
      {hafta?.durum === "gonderim" && (
        <AdminDugme islemde={islemde} onClick={() => calistir(() => artElemeBaslat(hafta.id))}>
          {a.elemeBaslat}
        </AdminDugme>
      )}
      {hafta?.durum === "eleme" && (
        <>
          <span style={{ color: t.dim, fontSize: 13 }}>{a.hedefSor}</span>
          <input
            type="number"
            min={1}
            value={hedef}
            onChange={(e) => setHedef(Number(e.target.value))}
            style={{ ...s2.alan, width: 80, padding: "6px 8px" }}
          />
          <AdminDugme
            islemde={islemde}
            onClick={() => calistir(() => artSonrakiTur(hafta.id, hedef))}
          >
            {a.sonrakiTur}
          </AdminDugme>
          <AdminDugme
            islemde={islemde}
            vurgu
            onClick={() => calistir(() => artSergiyeAl(hafta.id))}
          >
            {a.sergiyeAl}
          </AdminDugme>
        </>
      )}
      {hafta?.durum === "sergi" && (
        <AdminDugme islemde={islemde} onClick={() => calistir(() => artHaftaBitir(hafta.id))}>
          {a.haftaBitir}
        </AdminDugme>
      )}
    </div>
  );
}

function AdminDugme({ children, onClick, islemde, vurgu }) {
  return (
    <button
      onClick={onClick}
      disabled={islemde}
      style={{
        background: vurgu ? t.gradient : "none",
        color: vurgu ? "#0A0A0B" : t.text,
        border: vurgu ? "none" : `1px solid ${t.line}`,
        borderRadius: 8,
        padding: "8px 14px",
        fontSize: 13,
        fontWeight: vurgu ? 700 : 500,
        opacity: islemde ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

// ————— Ortak —————
function Durum({ mesaj }) {
  return (
    <div style={{ padding: "60px 0", textAlign: "center", color: t.dim, fontSize: 15 }}>
      {mesaj}
    </div>
  );
}

const kisaLink = (url) => String(url).replace(/^https?:\/\/(www\.)?/, "").slice(0, 24);

// Kullanıcı-girdisi URL güvenliği: yalnız http/https'e izin ver (javascript:/data: gibi
// XSS vektörlerini engelle). Şema yoksa https:// varsay. Güvenli değilse null.
function guvenliUrl(ham) {
  if (!ham) return null;
  const s = String(ham).trim();
  if (!s) return null;
  const aday = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(aday);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

const s2 = {
  _yuk: "…",
  baslik: { fontFamily: t.display, fontWeight: 800, fontSize: 24, margin: "0 0 6px" },
  alt: { color: t.dim, fontSize: 14, margin: "0 0 20px", lineHeight: 1.5 },
  kutu: { maxWidth: 320 },
  anaDugme: {
    background: t.gradient,
    color: "#0A0A0B",
    border: "none",
    borderRadius: 8,
    padding: "12px 24px",
    fontSize: 15,
    fontWeight: 700,
  },
  alan: {
    padding: "11px 14px",
    background: t.surface2,
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    color: t.text,
    fontSize: 14,
    outline: "none",
  },
  dosyaKutu: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 180,
    background: t.surface2,
    border: `1px dashed ${t.line}`,
    borderRadius: 10,
    cursor: "pointer",
    overflow: "hidden",
  },
  onizleme: { width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 8, display: "block" },
  izgara: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 16,
  },
  gorselKutu: {
    position: "relative",
    aspectRatio: "1 / 1",
    background: t.surface2,
    borderRadius: 10,
    overflow: "hidden",
  },
  gorsel: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  sira: {
    position: "absolute",
    top: 8,
    left: 8,
    background: "rgba(10,10,11,0.85)",
    borderRadius: 6,
    padding: "2px 8px",
    fontSize: 12,
    color: t.dim,
  },
  oyDugme: {
    width: "100%",
    marginTop: 8,
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    padding: "8px 0",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  modDugme: {
    background: "none",
    color: t.dim,
    border: `1px solid ${t.line}`,
    borderRadius: 6,
    padding: "3px 9px",
    fontSize: 12,
    cursor: "pointer",
  },
  sergiKart: {},
};
