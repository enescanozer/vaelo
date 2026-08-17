// Forum (topluluk): film/dizi + bölüm bazlı konu listesi ve thread görünümü.
// Tüm veri erişimi catalog.js üzerinden (merkezi). Yazma yolları forum-post Edge Function'ından
// (moderasyon FAIL-CLOSED + mute/ban + kilit backend'de zorunlu). Tasarım mevcut token'larla (theme.js).
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getForumKonular,
  getForumMesajlar,
  forumKonuOlustur,
  forumYanitla,
  forumDuzenle,
  forumMesajSil,
  forumBegen,
  forumBegenKaldir,
  forumRaporla,
  forumTakipDurum,
  forumTakipEt,
  forumTakipBirak,
  forumTakipIdleri,
} from "./catalog";
import { useLang } from "./i18n";
import { t } from "./theme";

const MAX = 5000; // backend forum-post ile AYNI

// Edge function hata kodu → kullanıcı dostu i18n mesajı (blocklist terms'i ASLA gösterilmez)
function hataMetni(s, kod) {
  return s.forum.hata[kod] ?? s.forum.hata.sunucu;
}

// Dar viewport (<768) → mobil bottom-sheet; aksi → sağ drawer. resize'e duyarlı.
function useMobil() {
  const [mobil, setMobil] = useState(() => (typeof window !== "undefined" ? window.innerWidth < 768 : false));
  useEffect(() => {
    const dinle = () => setMobil(window.innerWidth < 768);
    window.addEventListener("resize", dinle);
    return () => window.removeEventListener("resize", dinle);
  }, []);
  return mobil;
}

// Forum drawer (desktop sağ panel) / bottom-sheet (mobil). Mevcut görünümün ÜSTÜNE overlay
// olarak açılır — oynatıcıyı etkilemez. İçerik (list/thread) mevcut bileşenlerden gelir.
export default function ForumDrawer({ titleId, episodeId = null, baslikAd, bolumAd, user, girisAc, kapat }) {
  const { s } = useLang();
  const mobil = useMobil();
  const [konular, setKonular] = useState(null);
  const [aktifKonu, setAktifKonu] = useState(null); // { id, baslik, locked } | null
  const [hata, setHata] = useState(null);
  const [sekme, setSekme] = useState("tumu"); // tumu | takip | kilitli
  const [takipIds, setTakipIds] = useState(new Set());
  const [acildi, setAcildi] = useState(false); // giriş animasyonu

  async function konulariYukle() {
    try {
      setKonular(await getForumKonular(titleId, episodeId));
    } catch (e) {
      setHata(e.message);
      setKonular([]);
    }
  }
  useEffect(() => {
    setAktifKonu(null);
    konulariYukle();
    if (user) forumTakipIdleri(user.id).then((ids) => setTakipIds(new Set(ids)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleId, episodeId, user?.id]);
  useEffect(() => {
    const r = requestAnimationFrame(() => setAcildi(true));
    const dinle = (e) => e.key === "Escape" && kapat();
    window.addEventListener("keydown", dinle);
    return () => {
      cancelAnimationFrame(r);
      window.removeEventListener("keydown", dinle);
    };
  }, [kapat]);

  const ust = episodeId ? s.forum.bolumBaslik : s.forum.baslik;
  const context = episodeId ? bolumAd || baslikAd : baslikAd;
  const suzulmus = (konular ?? []).filter((k) =>
    sekme === "kilitli" ? k.locked : sekme === "takip" ? takipIds.has(k.id) : true
  );

  return (
    <div style={arkaPlan(mobil)} onClick={kapat}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...panel(mobil),
          transform: acildi ? "translate(0,0)" : mobil ? "translateY(100%)" : "translateX(100%)",
          transition: "transform 0.24s ease",
        }}
      >
        {/* Başlık çubuğu */}
        <div style={{ padding: mobil ? "8px 16px 12px" : "16px 18px", borderBottom: `1px solid ${t.line}`, flexShrink: 0 }}>
          {mobil && <div style={{ width: 40, height: 4, borderRadius: 999, background: t.line, margin: "0 auto 12px" }} />}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: t.display, fontWeight: 800, fontSize: 17 }}>{ust}</div>
              {context && <div style={{ color: t.dim, fontSize: 12, marginTop: 2 }}>{context}</div>}
            </div>
            <button onClick={kapat} aria-label={s.forum.kapat} style={{ background: "none", border: "none", color: t.dim, fontSize: 20, lineHeight: 1, cursor: "pointer", padding: 4 }}>✕</button>
          </div>
        </div>

        {/* Gövde (scroll yalnız burada) */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16, WebkitOverflowScrolling: "touch" }}>
          {aktifKonu ? (
            <KonuGorunum
              konu={aktifKonu}
              user={user}
              girisAc={girisAc}
              geri={() => {
                setAktifKonu(null);
                konulariYukle();
              }}
            />
          ) : (
            <>
              <YeniKonu titleId={titleId} episodeId={episodeId} user={user} girisAc={girisAc} sonra={konulariYukle} />
              {/* Sekmeler: Tümü / Takip Edilen / Kilitli */}
              <div style={{ display: "flex", gap: 6, marginTop: 14, marginBottom: 6 }}>
                {[["tumu", s.forum.hepsi], ["takip", s.forum.takipEdilen], ["kilitli", s.forum.kilitliler]].map(([k, ad]) => (
                  <button key={k} onClick={() => setSekme(k)} style={cip(sekme === k)}>{ad}</button>
                ))}
              </div>
              {hata && <div style={{ color: t.danger, fontSize: 13, marginTop: 12 }}>{hata}</div>}
              {konular === null ? (
                <div style={{ color: t.dim, fontSize: 14, marginTop: 24 }}>{s.genel.yukleniyor}</div>
              ) : suzulmus.length === 0 ? (
                <div style={{ color: t.dim, fontSize: 14, marginTop: 24 }}>{s.forum.konuYok}</div>
              ) : (
                <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
                  {suzulmus.map((k) => (
                    <button
                      key={k.id}
                      onClick={() => setAktifKonu({ id: k.id, baslik: k.baslik, locked: k.locked })}
                      style={{ textAlign: "left", background: t.surface, border: `1px solid ${t.line}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {k.locked && <span title={s.forum.kilitli} style={{ fontSize: 13 }}>🔒</span>}
                        <span style={{ fontWeight: 600, fontSize: 14, flex: 1, minWidth: 0 }}>{k.baslik}</span>
                      </div>
                      <div style={{ color: t.dim, fontSize: 12, marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <span>{k.yazar || "—"}</span>
                        <span>{s.forum.mesajSayisi(Number(k.mesaj_sayisi) || 0)}</span>
                        <span>{new Date(k.son_mesaj || k.created_at).toLocaleDateString(s.locale)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const arkaPlan = (mobil) => ({
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 60,
  display: "flex", justifyContent: mobil ? "center" : "flex-end", alignItems: mobil ? "flex-end" : "stretch",
});
const panel = (mobil) => mobil
  ? { width: "100%", maxHeight: "88vh", background: t.bg, borderRadius: "16px 16px 0 0", borderTop: `1px solid ${t.line}`, display: "flex", flexDirection: "column", paddingBottom: "env(safe-area-inset-bottom)" }
  : { width: "clamp(380px, 34vw, 460px)", height: "100vh", background: t.bg, borderLeft: `1px solid ${t.line}`, display: "flex", flexDirection: "column" };
const cip = (aktif) => ({ background: aktif ? t.surface2 : "none", border: `1px solid ${aktif ? t.accent : t.line}`, color: aktif ? t.text : t.dim, borderRadius: 999, padding: "5px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" });

// ————— Yeni konu composer (aç/kapa) —————
function YeniKonu({ titleId, episodeId, user, girisAc, sonra }) {
  const { s } = useLang();
  const [acik, setAcik] = useState(false);
  const [baslik, setBaslik] = useState("");
  const [icerik, setIcerik] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState(null);

  if (!user) {
    return (
      <button onClick={girisAc} style={anaBtn}>
        {s.forum.girisGerek}
      </button>
    );
  }
  if (!acik) {
    return (
      <button onClick={() => setAcik(true)} style={anaBtn}>
        {s.forum.yeniKonu}
      </button>
    );
  }

  async function gonder(e) {
    e.preventDefault();
    setHata(null);
    setBekliyor(true);
    const r = await forumKonuOlustur({
      title_id: titleId,
      episode_id: episodeId,
      baslik: baslik.trim(),
      content: icerik.trim(),
      is_spoiler: spoiler,
      lang: (s.locale || "en").slice(0, 2),
    });
    setBekliyor(false);
    if (r.hata) return setHata(hataMetni(s, r.kod));
    setBaslik("");
    setIcerik("");
    setSpoiler(false);
    setAcik(false);
    sonra();
  }

  return (
    <form onSubmit={gonder} style={kutu}>
      <input
        style={alan}
        placeholder={s.forum.konuBaslik}
        value={baslik}
        onChange={(e) => setBaslik(e.target.value)}
        maxLength={200}
        required
      />
      <Yazac deger={icerik} degistir={setIcerik} />
      <SpoilerKutu spoiler={spoiler} setSpoiler={setSpoiler} />
      {hata && <div style={{ color: t.danger, fontSize: 13 }}>{hata}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={bekliyor || !baslik.trim() || !icerik.trim()} style={gonderBtn(bekliyor || !baslik.trim() || !icerik.trim())}>
          {bekliyor ? s.forum.gonderiliyor : s.forum.gonder}
        </button>
        <button type="button" onClick={() => setAcik(false)} style={iptalBtn}>{s.forum.iptal}</button>
      </div>
    </form>
  );
}

// ————— Thread görünümü —————
function KonuGorunum({ konu, user, girisAc, geri }) {
  const { s } = useLang();
  const [mesajlar, setMesajlar] = useState(null);
  const [takip, setTakip] = useState(false);
  const [yanitId, setYanitId] = useState(null); // hangi mesaja cevap yazılıyor
  const [duzenleId, setDuzenleId] = useState(null);
  const [raporPost, setRaporPost] = useState(null);

  async function yukle() {
    setMesajlar(await getForumMesajlar(konu.id));
  }
  useEffect(() => {
    yukle();
    if (user) forumTakipDurum(konu.id, user.id).then(setTakip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [konu.id, user?.id]);

  async function takipDegis() {
    if (!user) return girisAc();
    const yeni = !takip;
    setTakip(yeni); // iyimser
    const r = yeni ? await forumTakipEt(konu.id, user.id) : await forumTakipBirak(konu.id, user.id);
    if (r.error) setTakip(!yeni); // rollback
  }

  // Flat listeyi ağaca çevir (parent_id); derinlik UI'da 3 ile sınırlanır
  const agac = useMemo(() => agacKur(mesajlar ?? []), [mesajlar]);

  return (
    <div>
      <button onClick={geri} style={geriStil}>{`← ${s.forum.konular}`}</button>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginTop: 12 }}>
        <div style={{ fontFamily: t.display, fontWeight: 800, fontSize: 18, flex: 1 }}>
          {konu.locked && <span style={{ marginRight: 8 }}>🔒</span>}
          {konu.baslik}
        </div>
        <button onClick={takipDegis} style={takipBtn(takip)}>
          {takip ? s.forum.takipBirak : s.forum.takipEt}
        </button>
      </div>

      {konu.locked && (
        <div style={{ color: t.dim, fontSize: 13, marginTop: 8, padding: "8px 12px", background: t.surface, border: `1px solid ${t.line}`, borderRadius: 8 }}>
          {s.forum.kilitliAlt}
        </div>
      )}

      {mesajlar === null ? (
        <div style={{ color: t.dim, fontSize: 14, marginTop: 24 }}>{s.genel.yukleniyor}</div>
      ) : (
        <div style={{ marginTop: 20 }}>
          {agac.map((m) => (
            <Mesaj
              key={m.id}
              m={m}
              derinlik={0}
              user={user}
              girisAc={girisAc}
              locked={konu.locked}
              yanitId={yanitId}
              setYanitId={setYanitId}
              duzenleId={duzenleId}
              setDuzenleId={setDuzenleId}
              acRapor={setRaporPost}
              threadId={konu.id}
              yenile={yukle}
            />
          ))}
        </div>
      )}

      {/* Kök seviyeye yeni yanıt (kilitli değilse) */}
      {!konu.locked && !yanitId && !duzenleId && (
        <div style={{ marginTop: 20 }}>
          <YanitComposer threadId={konu.id} parentId={null} user={user} girisAc={girisAc} sonra={yukle} />
        </div>
      )}

      {raporPost && (
        <RaporModal postId={raporPost} user={user} kapat={() => setRaporPost(null)} />
      )}
    </div>
  );
}

// Tek mesaj (+ nested cevaplar). Derinlik 3'te görsel indent sabitlenir (mobil taşma önlenir).
function Mesaj({ m, derinlik, user, girisAc, locked, yanitId, setYanitId, duzenleId, setDuzenleId, acRapor, threadId, yenile }) {
  const { s } = useLang();
  const [acikSpoiler, setAcikSpoiler] = useState(false);
  const [menu, setMenu] = useState(false);
  const [begeni, setBegeni] = useState(Number(m.begeni) || 0);
  const [begendim, setBegendim] = useState(!!m.benim_begenim);
  const indent = Math.min(derinlik, 3) * 16;
  const benimki = user && m.user_id === user.id;

  async function begenDegis() {
    if (!user) return girisAc();
    const yeni = !begendim;
    setBegendim(yeni);
    setBegeni((n) => n + (yeni ? 1 : -1)); // iyimser
    const r = yeni ? await forumBegen(m.id, user.id) : await forumBegenKaldir(m.id, user.id);
    if (r.error) {
      setBegendim(!yeni);
      setBegeni((n) => n + (yeni ? -1 : 1)); // rollback
    }
  }
  async function sil() {
    setMenu(false);
    const { error } = await forumMesajSil(m.id);
    if (!error) yenile();
  }

  const spoilerGizli = m.is_spoiler && !acikSpoiler;
  return (
    <div style={{ marginLeft: indent, borderLeft: derinlik > 0 ? `2px solid ${t.line}` : "none", paddingLeft: derinlik > 0 ? 12 : 0, marginTop: 12 }}>
      <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{m.yazar || "—"}</span>
          <span style={{ color: t.dim, fontSize: 12 }}>{new Date(m.created_at).toLocaleDateString(s.locale)}</span>
          {m.updated_at && m.updated_at !== m.created_at && (
            <span style={{ color: t.dim, fontSize: 11 }}>· {s.forum.duzenlendi}</span>
          )}
          <span style={{ flex: 1 }} />
          {/* ⋯ menü */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setMenu((v) => !v)} style={menuBtn} aria-label="⋯">⋯</button>
            {menu && (
              <div style={menuKutu} onMouseLeave={() => setMenu(false)}>
                {!locked && (
                  <button style={menuOge} onClick={() => { setMenu(false); setYanitId(m.id); }}>{s.forum.yanitla}</button>
                )}
                {benimki && !locked && (
                  <button style={menuOge} onClick={() => { setMenu(false); setDuzenleId(m.id); }}>{s.forum.duzenle}</button>
                )}
                {benimki && (
                  <button style={{ ...menuOge, color: t.danger }} onClick={sil}>{s.forum.sil}</button>
                )}
                {!benimki && (
                  <button style={menuOge} onClick={() => { setMenu(false); user ? acRapor(m.id) : girisAc(); }}>{s.forum.raporla}</button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* İçerik / düzenleme / spoiler */}
        {duzenleId === m.id ? (
          <DuzenleComposer m={m} kapat={() => setDuzenleId(null)} sonra={yenile} />
        ) : spoilerGizli ? (
          <button onClick={() => setAcikSpoiler(true)} style={spoilerBtn}>{s.forum.spoilerGizli}</button>
        ) : (
          <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.content}</div>
        )}

        {/* Beğeni */}
        {duzenleId !== m.id && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
            <button onClick={begenDegis} style={{ ...begenBtn, color: begendim ? t.accent : t.dim, borderColor: begendim ? t.accent : t.line }}>
              ♥ {begeni > 0 ? begeni : ""}
            </button>
          </div>
        )}
      </div>

      {/* Bu mesaja yanıt composer */}
      {yanitId === m.id && !locked && (
        <div style={{ marginTop: 8, marginLeft: 12 }}>
          <YanitComposer threadId={threadId} parentId={m.id} user={user} girisAc={girisAc} sonra={() => { setYanitId(null); yenile(); }} otomatikOdak kapat={() => setYanitId(null)} />
        </div>
      )}

      {/* Nested cevaplar */}
      {(m.cevaplar ?? []).map((c) => (
        <Mesaj
          key={c.id}
          m={c}
          derinlik={derinlik + 1}
          user={user}
          girisAc={girisAc}
          locked={locked}
          yanitId={yanitId}
          setYanitId={setYanitId}
          duzenleId={duzenleId}
          setDuzenleId={setDuzenleId}
          acRapor={acRapor}
          threadId={threadId}
          yenile={yenile}
        />
      ))}
    </div>
  );
}

function YanitComposer({ threadId, parentId, user, girisAc, sonra, otomatikOdak, kapat }) {
  const { s } = useLang();
  const [icerik, setIcerik] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState(null);
  const ref = useRef(null);
  useEffect(() => { if (otomatikOdak) ref.current?.focus(); }, [otomatikOdak]);

  if (!user) return <button onClick={girisAc} style={anaBtn}>{s.forum.girisGerek}</button>;

  async function gonder(e) {
    e.preventDefault();
    setHata(null);
    setBekliyor(true);
    const r = await forumYanitla({
      thread_id: threadId,
      parent_id: parentId,
      content: icerik.trim(),
      is_spoiler: spoiler,
      lang: (s.locale || "en").slice(0, 2),
    });
    setBekliyor(false);
    if (r.hata) return setHata(hataMetni(s, r.kod));
    setIcerik("");
    setSpoiler(false);
    sonra();
  }
  return (
    <form onSubmit={gonder} style={kutu}>
      <Yazac deger={icerik} degistir={setIcerik} inputRef={ref} yer={s.forum.yorumYaz} />
      <SpoilerKutu spoiler={spoiler} setSpoiler={setSpoiler} />
      {hata && <div style={{ color: t.danger, fontSize: 13 }}>{hata}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={bekliyor || !icerik.trim()} style={gonderBtn(bekliyor || !icerik.trim())}>
          {bekliyor ? s.forum.gonderiliyor : s.forum.gonder}
        </button>
        {kapat && <button type="button" onClick={kapat} style={iptalBtn}>{s.forum.iptal}</button>}
      </div>
    </form>
  );
}

function DuzenleComposer({ m, kapat, sonra }) {
  const { s } = useLang();
  const [icerik, setIcerik] = useState(m.content);
  const [spoiler, setSpoiler] = useState(!!m.is_spoiler);
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState(null);
  async function gonder(e) {
    e.preventDefault();
    setHata(null);
    setBekliyor(true);
    const r = await forumDuzenle({ post_id: m.id, content: icerik.trim(), is_spoiler: spoiler, lang: (s.locale || "en").slice(0, 2) });
    setBekliyor(false);
    if (r.hata) return setHata(hataMetni(s, r.kod));
    kapat();
    sonra();
  }
  return (
    <form onSubmit={gonder} style={{ ...kutu, marginTop: 0 }}>
      <Yazac deger={icerik} degistir={setIcerik} />
      <SpoilerKutu spoiler={spoiler} setSpoiler={setSpoiler} />
      {hata && <div style={{ color: t.danger, fontSize: 13 }}>{hata}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={bekliyor || !icerik.trim()} style={gonderBtn(bekliyor || !icerik.trim())}>
          {bekliyor ? s.forum.gonderiliyor : s.forum.kaydet}
        </button>
        <button type="button" onClick={kapat} style={iptalBtn}>{s.forum.iptal}</button>
      </div>
    </form>
  );
}

function RaporModal({ postId, user, kapat }) {
  const { s } = useLang();
  const NEDENLER = ["hakaret", "taciz", "spam", "spoiler", "uygunsuz", "diger"];
  const [neden, setNeden] = useState("hakaret");
  const [aciklama, setAciklama] = useState("");
  const [durum, setDurum] = useState("form"); // form | alindi | hata
  async function gonder(e) {
    e.preventDefault();
    const { error } = await forumRaporla(postId, user.id, neden, aciklama.trim() || null);
    // unique(post,reporter) → tekrar rapor 23505; yine "alındı" göster (idempotent his)
    setDurum(error && error.code !== "23505" ? "hata" : "alindi");
  }
  return (
    <div onClick={kapat} style={modalArka}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={gonder} style={modalKutu}>
        <div style={{ fontFamily: t.display, fontWeight: 800, fontSize: 18, marginBottom: 12 }}>{s.forum.raporBaslik}</div>
        {durum === "alindi" ? (
          <>
            <div style={{ color: t.text, fontSize: 14, marginBottom: 16 }}>{s.forum.raporAlindi}</div>
            <button onClick={kapat} style={gonderBtn(false)}>{s.forum.tamam}</button>
          </>
        ) : (
          <>
            <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
              {NEDENLER.map((n) => (
                <label key={n} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
                  <input type="radio" name="neden" checked={neden === n} onChange={() => setNeden(n)} />
                  {s.forum.raporNeden[n]}
                </label>
              ))}
            </div>
            <textarea style={{ ...alan, minHeight: 60, resize: "vertical" }} placeholder={s.forum.raporAciklama} value={aciklama} onChange={(e) => setAciklama(e.target.value)} />
            {durum === "hata" && <div style={{ color: t.danger, fontSize: 13, marginTop: 8 }}>{s.forum.hata.sunucu}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button type="submit" style={gonderBtn(false)}>{s.forum.raporGonder}</button>
              <button type="button" onClick={kapat} style={iptalBtn}>{s.forum.iptal}</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

// ————— Ortak küçük bileşenler + stiller —————
function Yazac({ deger, degistir, inputRef, yer }) {
  const { s } = useLang();
  return (
    <div>
      <textarea
        ref={inputRef}
        style={{ ...alan, minHeight: 90, resize: "vertical" }}
        placeholder={yer ?? s.forum.mesaj}
        value={deger}
        onChange={(e) => degistir(e.target.value.slice(0, MAX))}
        maxLength={MAX}
        required
      />
      <div style={{ color: t.dim, fontSize: 11, textAlign: "right" }}>{s.forum.karakter(deger.length, MAX)}</div>
    </div>
  );
}
function SpoilerKutu({ spoiler, setSpoiler }) {
  const { s } = useLang();
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: t.dim, cursor: "pointer" }}>
      <input type="checkbox" checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} />
      {s.forum.spoiler}
    </label>
  );
}

const kutu = { display: "grid", gap: 10, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 10, padding: 14, marginTop: 12 };
const alan = { width: "100%", padding: "10px 12px", background: t.surface2, border: `1px solid ${t.line}`, borderRadius: 8, color: t.text, fontSize: 14, outline: "none", boxSizing: "border-box" };
const anaBtn = { marginTop: 4, background: t.gradient, color: "#0A0A0B", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" };
const gonderBtn = (dis) => ({ background: t.gradient, color: "#0A0A0B", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 700, opacity: dis ? 0.6 : 1, cursor: dis ? "default" : "pointer" });
const iptalBtn = { background: "none", border: `1px solid ${t.line}`, borderRadius: 8, color: t.dim, padding: "9px 16px", fontSize: 14, cursor: "pointer" };
const geriStil = { background: "none", border: "none", color: t.dim, fontSize: 13, padding: 0, cursor: "pointer" };
const takipBtn = (aktif) => ({ background: "none", border: `1px solid ${aktif ? t.accent : t.line}`, borderRadius: 999, color: aktif ? t.accent : t.text, padding: "6px 14px", fontSize: 13, whiteSpace: "nowrap", cursor: "pointer" });
const begenBtn = { background: "none", border: `1px solid ${t.line}`, borderRadius: 999, padding: "4px 12px", fontSize: 13, cursor: "pointer" };
const spoilerBtn = { background: t.surface2, border: `1px dashed ${t.line}`, borderRadius: 8, color: t.dim, padding: "10px 14px", fontSize: 13, cursor: "pointer", width: "100%", textAlign: "center" };
const menuBtn = { background: "none", border: "none", color: t.dim, fontSize: 18, lineHeight: 1, padding: "0 4px", cursor: "pointer" };
const menuKutu = { position: "absolute", right: 0, top: 22, background: t.surface2, border: `1px solid ${t.line}`, borderRadius: 8, display: "grid", zIndex: 5, minWidth: 120, overflow: "hidden" };
const menuOge = { background: "none", border: "none", color: t.text, textAlign: "left", padding: "9px 14px", fontSize: 13, cursor: "pointer" };
const modalArka = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 };
const modalKutu = { width: 400, maxWidth: "92vw", background: t.surface, border: `1px solid ${t.line}`, borderRadius: 12, padding: 24 };

// Flat mesaj listesini parent_id ağacına çevir (kök = parent_id null)
function agacKur(liste) {
  const harita = new Map();
  liste.forEach((m) => harita.set(m.id, { ...m, cevaplar: [] }));
  const kok = [];
  liste.forEach((m) => {
    const dugum = harita.get(m.id);
    if (m.parent_id && harita.has(m.parent_id)) harita.get(m.parent_id).cevaplar.push(dugum);
    else kok.push(dugum);
  });
  return kok;
}
