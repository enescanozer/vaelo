// Moderasyon paneli. İnceleme kuyruğu MODERATÖR + admin'e açık; sponsor/yarışma/rol
// yönetimi ve denetim kaydı YALNIZ admin (owner). Erişim RLS'te: is_moderator / is_admin.
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import {
  iframeUrl,
  katalogTazele,
  getCreatorBasvurular,
  creatorOnayla,
  creatorReddet,
  getModerasyonKuyrugu,
  moderasyonKarar,
  getPlatformMode,
  setPlatformMode,
  getForumRaporKuyrugu,
  forumPostKaldir,
  forumPostRaporKapat,
  getForumThreadYonetim,
  forumThreadKaldir,
  forumThreadKilitle,
  forumKullaniciAra,
  forumYaptirimUygula,
  forumYaptirimGecmisi,
  getBagisAyarlari,
  setAppSetting,
  turAdi,
} from "./catalog";
import { useLang } from "./i18n";
import { t } from "./theme";

export default function AdminPanel({ admin }) {
  const { s } = useLang();
  const [kuyruk, setKuyruk] = useState(null);
  const [hata, setHata] = useState(null);
  const [islemde, setIslemde] = useState(null); // işlem yapılan video id'si

  async function yenile() {
    const { data, error } = await supabase
      .from("videos")
      .select("*, titles(id, name, kind, status)")
      .eq("status", "in_review")
      .order("created_at", { ascending: true });
    if (error) setHata(error.message);
    else setKuyruk(data ?? []);
  }

  useEffect(() => {
    yenile();
  }, []);

  // Onayla: video approved + başlık (taslaksa) published
  async function onayla(video) {
    setIslemde(video.id);
    const simdi = new Date().toISOString();
    const { error } = await supabase
      .from("videos")
      .update({ status: "approved", published_at: simdi })
      .eq("id", video.id);
    if (!error) {
      await supabase
        .from("titles")
        .update({ status: "published", published_at: simdi })
        .eq("id", video.title_id)
        .eq("status", "draft");
      katalogTazele(); // yeni bölüm Keşfet'te önbellek beklemeden görünsün
    } else {
      setHata(error.message);
    }
    setIslemde(null);
    yenile();
  }

  async function reddet(video) {
    setIslemde(video.id);
    const { error } = await supabase
      .from("videos")
      .update({ status: "rejected" })
      .eq("id", video.id);
    if (error) setHata(error.message);
    setIslemde(null);
    yenile();
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: t.pad }}>
      <div style={{ fontFamily: t.display, fontWeight: 800, fontSize: 26, marginBottom: 6 }}>
        {s.panel.kuyrukBaslik}
      </div>
      <div style={{ color: t.dim, fontSize: 14, marginBottom: 28 }}>{s.panel.kuyrukAciklama}</div>

      {hata && (
        <div style={{ color: t.danger, fontSize: 13, marginBottom: 16 }}>{hata}</div>
      )}

      {kuyruk === null && <div style={{ color: t.dim }}>{s.genel.yukleniyor}</div>}
      {kuyruk?.length === 0 && (
        <div style={{ color: t.dim, padding: "40px 0", textAlign: "center" }}>
          {s.panel.kuyrukBos}
        </div>
      )}

      <div style={{ display: "grid", gap: 20 }}>
        {kuyruk?.map((video) => (
          <div
            key={video.id}
            style={{
              background: t.surface,
              border: `1px solid ${t.line}`,
              borderRadius: 10,
              padding: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
              <span style={{ fontFamily: t.display, fontWeight: 700, fontSize: 17 }}>
                {video.titles?.name}
              </span>
              <span style={{ color: t.dim, fontSize: 13 }}>
                {video.titles?.kind === "dizi"
                  ? `${s.genel.seb(video.season ?? 1, video.episode ?? 1)}${video.name ? ` — ${video.name}` : ""}`
                  : turAdi(video.titles?.kind, s)}
              </span>
              <span style={{ color: t.dim, fontSize: 12, marginLeft: "auto" }}>
                {new Date(video.created_at).toLocaleString(s.locale)}
              </span>
            </div>

            {/* AI ön-eleme işareti (ai-screen fonksiyonu yazdıysa) */}
            {video.ai_risk && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 12,
                  fontSize: 12,
                }}
              >
                <span
                  style={{
                    color:
                      video.ai_risk === "high"
                        ? t.danger
                        : video.ai_risk === "medium"
                          ? t.text
                          : t.dim,
                    border: `1px solid ${t.line}`,
                    borderRadius: 6,
                    padding: "3px 9px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.panel.aiRisk[video.ai_risk] ?? video.ai_risk}
                </span>
                {video.ai_ozet && (
                  <span style={{ color: t.dim, minWidth: 0 }}>{video.ai_ozet}</span>
                )}
              </div>
            )}

            {/* Önizleme — inceleme aşamasında iframe ile */}
            <div
              style={{
                position: "relative",
                paddingTop: "56.25%",
                background: "#000",
                borderRadius: 8,
                overflow: "hidden",
                marginBottom: 14,
              }}
            >
              <iframe
                src={iframeUrl(video.cf_uid)}
                title={video.name || video.titles?.name}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  border: "none",
                }}
                allowFullScreen
              />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => onayla(video)}
                disabled={islemde === video.id}
                style={{
                  background: t.gradient,
                  color: "#0A0A0B",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 700,
                  opacity: islemde === video.id ? 0.6 : 1,
                }}
              >
                {s.panel.onayla}
              </button>
              <button
                onClick={() => reddet(video)}
                disabled={islemde === video.id}
                style={{
                  background: "none",
                  border: `1px solid ${t.line}`,
                  borderRadius: 8,
                  color: t.danger,
                  padding: "10px 20px",
                  fontSize: 14,
                  opacity: islemde === video.id ? 0.6 : 1,
                }}
              >
                {s.panel.reddet}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Moderasyon kuyruğu (MANUAL_REVIEW + Tier 2 bekleyen) — moderatör + admin görür */}
      <ModerasyonKuyrugu />

      {/* Topluluk / Forum moderasyonu — moderatör + admin görür */}
      <ForumRaporlar />
      <ForumThreadYonetim />
      <ForumKullaniciModerasyon />

      {/* Gelir/yarışma/rol/denetim yalnız admin (owner); moderatör yalnız inceleme kuyruğu */}
      {admin && (
        <>
          <PlatformModu />
          <PromoBannerlar />
          <BagisAyarlari />
          <Basvurular />
          <Roller />
          <Sponsorlar />
          <ReferansSayaci />
          <Yarismalar />
          <DenetimKaydi />
        </>
      )}
    </div>
  );
}

// saniye → m:ss
function sureBicim(sn) {
  const x = Math.max(0, Math.floor(Number(sn) || 0));
  return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`;
}

// ————— Moderasyon kuyruğu (moderatör + admin): elle inceleme + Tier 2 bekleyenler —————
// Kaynak: moderation_results (Tier 1/2 boru hattı). Onay/Ret video status'unu günceller
// (mevcut audit_log tetikleyicisi kim/ne zaman'ı yakalar) + moderation_results'ı işaretler.
function ModerasyonKuyrugu() {
  const { s } = useLang();
  const [liste, setListe] = useState(null);
  const [hata, setHata] = useState(null);
  const [islemde, setIslemde] = useState(null);

  async function yenile() {
    try {
      setListe(await getModerasyonKuyrugu());
    } catch (e) {
      setHata(e.message);
      setListe([]);
    }
  }
  useEffect(() => {
    yenile();
  }, []);

  async function karar(mr, onay) {
    setIslemde(mr.id);
    const { error } = await moderasyonKarar(mr, onay);
    if (error) setHata(error.message);
    setIslemde(null);
    yenile();
  }

  // Skor bandı: yeşil <0.40 · amber 0.40–0.85 · kırmızı ≥0.85 · null/bilinmiyor gri
  function bandRenk(v) {
    if (v == null) return t.dim;
    if (v >= 0.85) return t.danger;
    if (v >= 0.4) return "#E5B23C"; // amber (anlamsal risk bandı — marka aksanı değil)
    return "#3FB463"; // green
  }
  const KATEGORILER = ["nudity", "violence", "hate_politics", "profanity"];

  if (liste === null) return null; // ilk yükleme sessiz

  return (
    <div style={{ marginTop: 48 }}>
      <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 18, marginBottom: 6 }}>
        {s.panel.mod.baslik}
      </div>
      <div style={{ color: t.dim, fontSize: 13, marginBottom: 16 }}>{s.panel.mod.aciklama}</div>
      {hata && <div style={{ color: t.danger, fontSize: 13, marginBottom: 12 }}>{hata}</div>}
      {liste.length === 0 && (
        <div style={{ color: t.dim, padding: "24px 0", textAlign: "center" }}>{s.panel.mod.bos}</div>
      )}

      <div style={{ display: "grid", gap: 14 }}>
        {liste.map((mr) => {
          const v = mr.videos;
          const bekliyor = mr.final_action !== "MANUAL_REVIEW"; // pending/processing → İnceleniyor
          const skorlar = mr.tier2_scores ?? mr.tier1_scores ?? {};
          return (
            <div
              key={mr.id}
              style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 10, padding: 16 }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                <span style={{ fontFamily: t.display, fontWeight: 700, fontSize: 16 }}>
                  {v?.titles?.name}
                </span>
                <span style={{ color: t.dim, fontSize: 12 }}>
                  {v?.titles?.kind === "dizi"
                    ? `${s.genel.seb(v.season ?? 1, v.episode ?? 1)}${v.name ? ` — ${v.name}` : ""}`
                    : turAdi(v?.titles?.kind, s)}
                </span>
                {v?.titles?.creator_id && (
                  <span style={{ color: t.dim, fontSize: 11 }}>@{v.titles.creator_id.slice(0, 8)}</span>
                )}
                <span style={{ color: t.dim, fontSize: 12, marginLeft: "auto" }}>
                  {new Date(mr.created_at).toLocaleString(s.locale)}
                </span>
              </div>

              {/* Kategori rozetleri (tier2 varsa o, yoksa tier1) */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {KATEGORILER.map((k) => {
                  const val = skorlar[k];
                  return (
                    <span
                      key={k}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        border: `1px solid ${t.line}`,
                        borderRadius: 6,
                        padding: "3px 9px",
                        fontSize: 12,
                      }}
                    >
                      <span style={{ color: t.dim }}>{s.panel.mod.kategori[k]}</span>
                      <span style={{ color: bandRenk(val), fontWeight: 700 }}>
                        {val == null ? s.panel.mod.bilinmiyor : Number(val).toFixed(2)}
                      </span>
                    </span>
                  );
                })}
              </div>

              {mr.reasoning && (
                <div style={{ color: t.dim, fontSize: 13, marginBottom: 8 }}>
                  {s.panel.mod.gerekce}: {mr.reasoning}
                </div>
              )}

              {Array.isArray(mr.flagged_timestamps) && mr.flagged_timestamps.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    alignItems: "center",
                    marginBottom: 10,
                    fontSize: 12,
                    color: t.dim,
                  }}
                >
                  <span>{s.panel.mod.kareler}:</span>
                  {mr.flagged_timestamps.map((f, i) => (
                    <span key={i} style={{ border: `1px solid ${t.line}`, borderRadius: 6, padding: "2px 7px" }}>
                      {sureBicim(f.t)}
                      {f.reason ? ` · ${s.panel.mod.kategori[f.reason] ?? f.reason}` : ""}
                    </span>
                  ))}
                </div>
              )}

              {bekliyor ? (
                <div style={{ color: t.accent, fontSize: 13, fontWeight: 600 }}>{s.panel.mod.inceleniyor}</div>
              ) : (
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => karar(mr, true)}
                    disabled={islemde === mr.id}
                    style={{
                      background: t.gradient,
                      color: "#0A0A0B",
                      border: "none",
                      borderRadius: 8,
                      padding: "9px 18px",
                      fontSize: 13,
                      fontWeight: 700,
                      opacity: islemde === mr.id ? 0.6 : 1,
                    }}
                  >
                    {s.panel.onayla}
                  </button>
                  <button
                    onClick={() => karar(mr, false)}
                    disabled={islemde === mr.id}
                    style={{
                      background: "none",
                      border: `1px solid ${t.line}`,
                      borderRadius: 8,
                      color: t.danger,
                      padding: "9px 18px",
                      fontSize: 13,
                      opacity: islemde === mr.id ? 0.6 : 1,
                    }}
                  >
                    {s.panel.reddet}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ————— Platform modu (yalnız admin): festival ↔ netflix (site geneli, onaylı) —————
function PlatformModu() {
  const { s } = useLang();
  const [mod, setMod] = useState(null);
  const [hata, setHata] = useState(null);

  useEffect(() => {
    getPlatformMode().then(setMod).catch(() => {});
  }, []);

  async function degistir(yeni) {
    if (yeni === mod) return;
    if (!window.confirm(s.panel.mode.onay)) return; // her ziyaretçiyi etkiler → onay
    const { error } = await setPlatformMode(yeni);
    if (error) setHata(error.message);
    else setMod(yeni);
  }

  return (
    <div style={{ marginTop: 48 }}>
      <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 18, marginBottom: 6 }}>
        {s.panel.mode.baslik}
      </div>
      <div style={{ color: t.dim, fontSize: 13, marginBottom: 16 }}>{s.panel.mode.aciklama}</div>
      {hata && <div style={{ color: t.danger, fontSize: 13, marginBottom: 12 }}>{hata}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        {["festival", "netflix"].map((m) => (
          <button
            key={m}
            onClick={() => degistir(m)}
            style={{
              background: mod === m ? t.gradient : "none",
              color: mod === m ? "#0A0A0B" : t.dim,
              border: `1px solid ${mod === m ? t.accent : t.line}`,
              borderRadius: 8,
              padding: "9px 22px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {m === "festival" ? s.panel.mode.festivalAd : s.panel.mode.netflixAd}
          </button>
        ))}
      </div>
    </div>
  );
}

// ————— Toplama promo banner'ları (yalnız admin) — Sponsorlar örüntüsü, AYRI tablo —————
function PromoBannerlar() {
  const { s } = useLang();
  const [liste, setListe] = useState([]);
  const [baslik, setBaslik] = useState("");
  const [metin, setMetin] = useState("");
  const [gorsel, setGorsel] = useState("");
  const [link, setLink] = useState("");
  const [baslar, setBaslar] = useState(""); // datetime-local (boş → hemen)
  const [biter, setBiter] = useState("");   // datetime-local (boş → süresiz)
  const [hata, setHata] = useState(null);

  async function yenile() {
    const { data, error } = await supabase
      .from("promo_banners").select("*").order("created_at", { ascending: false });
    if (error) setHata(error.message);
    else setListe(data ?? []);
  }
  useEffect(() => {
    yenile();
  }, []);

  async function ekle(e) {
    e.preventDefault();
    const { error } = await supabase.from("promo_banners").insert({
      title: baslik,
      body: metin || null,
      image_url: gorsel || null,
      link_url: link || null,
      // datetime-local yerel saat verir → ISO'ya çevir (boşsa null: hemen/süresiz)
      starts_at: baslar ? new Date(baslar).toISOString() : null,
      ends_at: biter ? new Date(biter).toISOString() : null,
    });
    if (error) return setHata(error.message);
    setBaslik("");
    setMetin("");
    setGorsel("");
    setLink("");
    setBaslar("");
    setBiter("");
    yenile();
  }
  async function acKapat(b) {
    await supabase.from("promo_banners").update({ active: !b.active }).eq("id", b.id);
    yenile();
  }
  async function sil(b) {
    await supabase.from("promo_banners").delete().eq("id", b.id);
    yenile();
  }

  const alanStil = {
    padding: "9px 12px",
    background: t.surface2,
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    color: t.text,
    fontSize: 13,
    outline: "none",
  };

  // Banner şu an tarih penceresi içinde mi (aktiflik ayrı gösterilir)
  function bannerCanli(b) {
    const simdi = Date.now();
    if (b.starts_at && new Date(b.starts_at).getTime() > simdi) return false;
    if (b.ends_at && new Date(b.ends_at).getTime() <= simdi) return false;
    return true;
  }

  return (
    <div style={{ marginTop: 48 }}>
      <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 18, marginBottom: 6 }}>
        {s.panel.promo.baslik}
      </div>
      <div style={{ color: t.dim, fontSize: 13, marginBottom: 16 }}>{s.panel.promo.aciklama}</div>
      {hata && <div style={{ color: t.danger, fontSize: 13, marginBottom: 12 }}>{hata}</div>}

      <form onSubmit={ekle} style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input style={{ ...alanStil, width: 180 }} placeholder={s.panel.promo.baslikAlan} value={baslik} onChange={(e) => setBaslik(e.target.value)} required />
        <input style={{ ...alanStil, flex: 1, minWidth: 160 }} placeholder={s.panel.promo.metin} value={metin} onChange={(e) => setMetin(e.target.value)} />
        <input style={{ ...alanStil, width: 180 }} placeholder={s.panel.promo.gorselAlan} value={gorsel} onChange={(e) => setGorsel(e.target.value)} />
        <input style={{ ...alanStil, width: 180 }} placeholder={s.panel.promo.linkAlan} type="url" value={link} onChange={(e) => setLink(e.target.value)} />
        <label style={{ color: t.dim, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          {s.panel.promo.baslar}
          <input style={{ ...alanStil, width: 190 }} type="datetime-local" value={baslar} onChange={(e) => setBaslar(e.target.value)} />
        </label>
        <label style={{ color: t.dim, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          {s.panel.promo.biter}
          <input style={{ ...alanStil, width: 190 }} type="datetime-local" value={biter} onChange={(e) => setBiter(e.target.value)} />
        </label>
        <button type="submit" style={{ background: t.gradient, color: "#0A0A0B", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700 }}>
          {s.panel.ekle}
        </button>
      </form>

      <div style={{ display: "grid", gap: 8 }}>
        {liste.length === 0 && <div style={{ color: t.dim, fontSize: 13 }}>{s.panel.promo.yok}</div>}
        {liste.map((b) => (
          <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: t.surface, border: `1px solid ${t.line}`, borderRadius: 8, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>{b.title}</span>
            {b.body && <span style={{ color: t.dim, flex: 1, minWidth: 0 }}>{b.body}</span>}
            {!b.body && <span style={{ flex: 1 }} />}
            {(b.starts_at || b.ends_at) && (
              <span style={{ color: t.dim, fontSize: 11 }}>
                {b.starts_at ? new Date(b.starts_at).toLocaleString(s.locale) : "—"}
                {" → "}
                {b.ends_at ? new Date(b.ends_at).toLocaleString(s.locale) : "∞"}
              </span>
            )}
            {b.active && bannerCanli(b) && (
              <span style={{ color: t.accent, fontSize: 11, fontWeight: 700 }}>{s.panel.promo.canli}</span>
            )}
            <span style={{ color: b.active ? t.accent : t.dim, fontSize: 12 }}>
              {b.active ? s.panel.aktif : s.panel.pasif}
            </span>
            <button onClick={() => acKapat(b)} style={{ background: "none", border: `1px solid ${t.line}`, borderRadius: 6, color: t.dim, padding: "5px 10px", fontSize: 12 }}>
              {b.active ? s.panel.durdur : s.panel.surdur}
            </button>
            <button onClick={() => sil(b)} style={{ background: "none", border: "none", color: t.danger, fontSize: 12, padding: "5px 4px" }}>
              {s.panel.sil}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ————— Üretici başvuruları (yalnız admin): onayla → role=creator —————
function Basvurular() {
  const { s } = useLang();
  const [liste, setListe] = useState([]);
  const [hata, setHata] = useState(null);

  async function yenile() {
    try {
      setListe(await getCreatorBasvurular());
    } catch (e) {
      setHata(e.message);
    }
  }
  useEffect(() => {
    yenile();
  }, []);

  async function karar(userId, onay) {
    const { error } = onay ? await creatorOnayla(userId) : await creatorReddet(userId);
    if (error) setHata(error.message);
    else yenile();
  }

  const dgm = {
    border: `1px solid ${t.line}`,
    borderRadius: 6,
    padding: "5px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    background: "none",
  };

  return (
    <div style={{ marginTop: 48 }}>
      <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 18, marginBottom: 6 }}>
        {s.panel.basvuruBaslik}
      </div>
      <div style={{ color: t.dim, fontSize: 13, marginBottom: 16 }}>{s.panel.basvuruAciklama}</div>
      {hata && <div style={{ color: t.danger, fontSize: 13, marginBottom: 12 }}>{hata}</div>}
      {liste.length === 0 && <div style={{ color: t.dim, fontSize: 13 }}>{s.panel.basvuruYok}</div>}
      <div style={{ display: "grid", gap: 8 }}>
        {liste.map((b) => (
          <div
            key={b.user_id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              background: t.surface,
              border: `1px solid ${t.line}`,
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            <span style={{ fontWeight: 600 }}>{b.ad || s.panel.basvuruAdsiz}</span>
            <span style={{ color: t.dim, fontSize: 11 }}>{b.user_id.slice(0, 8)}</span>
            {b.mesaj ? (
              <span style={{ color: t.dim, flex: 1, minWidth: 0 }}>{b.mesaj}</span>
            ) : (
              <span style={{ flex: 1 }} />
            )}
            {b.durum === "beklemede" ? (
              <>
                <button
                  onClick={() => karar(b.user_id, true)}
                  style={{ ...dgm, background: t.gradient, color: "#0A0A0B", border: "none" }}
                >
                  {s.panel.basvuruOnayla}
                </button>
                <button onClick={() => karar(b.user_id, false)} style={{ ...dgm, color: t.danger }}>
                  {s.panel.basvuruReddet}
                </button>
              </>
            ) : (
              <span style={{ color: b.durum === "onaylandi" ? t.accent : t.dim, fontSize: 12 }}>
                {s.panel.basvuruDurum[b.durum]}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ————— Rol yönetimi (yalnız admin): kullanıcıları moderator/creator/viewer yap —————
// 'admin' atama/kaldırma bilerek YOK — o yalnız SQL Editor (service role) ile yapılır.
function Roller() {
  const { s } = useLang();
  const [liste, setListe] = useState([]);
  const [hata, setHata] = useState(null);

  async function yenile() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, role")
      .order("role", { ascending: true });
    if (error) setHata(error.message);
    else setListe(data ?? []);
  }
  useEffect(() => {
    yenile();
  }, []);

  async function rolDegistir(kullanici, yeni) {
    if (kullanici.role === yeni) return;
    const { error } = await supabase.from("profiles").update({ role: yeni }).eq("id", kullanici.id);
    if (error) setHata(error.message);
    else yenile();
  }

  const secilebilir = ["viewer", "creator", "moderator"];

  return (
    <div style={{ marginTop: 48 }}>
      <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 18, marginBottom: 6 }}>
        {s.panel.rolBaslik}
      </div>
      <div style={{ color: t.dim, fontSize: 13, marginBottom: 16 }}>{s.panel.rolAciklama}</div>

      {hata && <div style={{ color: t.danger, fontSize: 13, marginBottom: 12 }}>{hata}</div>}

      <div style={{ display: "grid", gap: 8 }}>
        {liste.map((k) => (
          <div
            key={k.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              background: t.surface,
              border: `1px solid ${t.line}`,
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            <span style={{ fontWeight: 600 }}>{k.display_name || s.panel.rolAdsiz}</span>
            <span style={{ color: t.dim, fontSize: 11 }}>{k.id.slice(0, 8)}</span>
            <span style={{ flex: 1 }} />
            {k.role === "admin" ? (
              <span style={{ color: t.accent, fontSize: 12, fontWeight: 600 }}>
                {s.panel.rolAdi.admin}
              </span>
            ) : (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {secilebilir.map((r) => (
                  <button
                    key={r}
                    onClick={() => rolDegistir(k, r)}
                    style={{
                      background: k.role === r ? t.gradient : "none",
                      color: k.role === r ? "#0A0A0B" : t.dim,
                      border: `1px solid ${k.role === r ? t.accent : t.line}`,
                      borderRadius: 6,
                      padding: "4px 10px",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {s.panel.rolAdi[r]}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ————— Referans sayacı (üretici → getirdiği kayıt sayısı) —————
function ReferansSayaci() {
  const { s } = useLang();
  const [liste, setListe] = useState(null);

  useEffect(() => {
    supabase.rpc("referans_sayaci").then(({ data }) => setListe(data ?? []));
  }, []);

  return (
    <div style={{ marginTop: 48 }}>
      <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 18, marginBottom: 6 }}>
        {s.panel.referans.baslik}
      </div>
      <div style={{ color: t.dim, fontSize: 13, marginBottom: 16 }}>{s.panel.referans.aciklama}</div>
      {liste !== null && liste.length === 0 && (
        <div style={{ color: t.dim, fontSize: 13 }}>{s.panel.referans.yok}</div>
      )}
      <div style={{ display: "grid", gap: 8 }}>
        {(liste ?? []).map((r) => (
          <div
            key={r.uretici_id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              background: t.surface,
              border: `1px solid ${t.line}`,
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            <span style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>
              {r.uretici_ad || r.uretici_id}
            </span>
            <span style={{ color: t.accent, fontWeight: 700 }}>
              {Number(r.kayit_sayisi).toLocaleString(s.locale)}
            </span>
            <span style={{ color: t.dim }}>{s.panel.referans.kayit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ————— Forum: rapor kuyruğu (moderatör + admin) —————
function ForumRaporlar() {
  const { s } = useLang();
  const [liste, setListe] = useState(null);
  const yenile = () => getForumRaporKuyrugu().then(setListe);
  useEffect(() => { yenile(); }, []);

  async function postKaldir(r) { await forumPostKaldir(r.post_id); yenile(); }
  async function yoksay(r) { await forumPostRaporKapat(r.post_id, "dismissed"); yenile(); }
  async function yaptirim(r, action) {
    const gun = action === "mute" ? 3 : null; // mute varsayılan 3 gün; ban süresiz
    const expires = gun ? new Date(Date.now() + gun * 864e5).toISOString() : null;
    await forumYaptirimUygula(r.poster_id, action, `forum: ${r.thread_baslik}`, expires);
    yenile();
  }

  return (
    <div style={{ marginTop: 48 }}>
      <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 18, marginBottom: 6 }}>{s.panel.forum.raporlar}</div>
      <div style={{ color: t.dim, fontSize: 13, marginBottom: 16 }}>{s.panel.forum.raporlarAlt}</div>
      {liste !== null && liste.length === 0 && <div style={{ color: t.dim, fontSize: 13 }}>{s.panel.forum.raporYok}</div>}
      <div style={{ display: "grid", gap: 10 }}>
        {(liste ?? []).map((r) => (
          <div key={r.post_id} style={kartStil}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{r.thread_baslik}</span>
              <span style={{ color: t.dim, fontSize: 12 }}>· {r.yazar}</span>
              <span style={{ color: t.accent, fontSize: 12, fontWeight: 700 }}>⚑ {Number(r.rapor_sayisi)}</span>
              <span style={{ color: t.dim, fontSize: 11 }}>{(r.gerekceler ?? []).map((g) => s.forum.raporNeden[g] ?? g).join(", ")}</span>
            </div>
            <div style={{ fontSize: 13, color: t.dim, marginTop: 6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {r.post_status === "removed" ? `(${s.panel.forum.kaldirildi})` : r.icerik}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <button onClick={() => yoksay(r)} style={kucukBtn(t.dim)}>{s.panel.forum.yoksay}</button>
              {r.post_status !== "removed" && <button onClick={() => postKaldir(r)} style={kucukBtn(t.danger)}>{s.panel.forum.postKaldir}</button>}
              <button onClick={() => yaptirim(r, "warning")} style={kucukBtn(t.dim)}>{s.panel.forum.uyar}</button>
              <button onClick={() => yaptirim(r, "mute")} style={kucukBtn(t.dim)}>{s.panel.forum.sustur}</button>
              <button onClick={() => yaptirim(r, "ban")} style={kucukBtn(t.danger)}>{s.panel.forum.banla}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ————— Forum: konu yönetimi (kilit/kaldır + arama) —————
function ForumThreadYonetim() {
  const { s } = useLang();
  const [liste, setListe] = useState(null);
  const [ara, setAra] = useState("");
  const yenile = (q = null) => getForumThreadYonetim(q).then(setListe);
  useEffect(() => { yenile(); }, []);

  async function kilit(th) { await forumThreadKilitle(th.id, !th.locked); yenile(ara || null); }
  async function kaldir(th) { await forumThreadKaldir(th.id); yenile(ara || null); }

  return (
    <div style={{ marginTop: 48 }}>
      <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 18, marginBottom: 6 }}>{s.panel.forum.konular}</div>
      <form onSubmit={(e) => { e.preventDefault(); yenile(ara.trim() || null); }} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input style={{ ...girisStil, flex: 1 }} placeholder={s.panel.forum.ara} value={ara} onChange={(e) => setAra(e.target.value)} />
        <button type="submit" style={kucukBtn(t.text)}>{s.panel.forum.araBtn}</button>
      </form>
      <div style={{ display: "grid", gap: 8 }}>
        {(liste ?? []).map((th) => (
          <div key={th.id} style={{ ...kartStil, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 0 }}>
              {th.locked && "🔒 "}{th.status === "removed" && "🚫 "}{th.baslik}
            </span>
            <span style={{ color: t.dim, fontSize: 12 }}>{th.title_ad} · {th.yazar} · {Number(th.mesaj_sayisi)}</span>
            <button onClick={() => kilit(th)} style={kucukBtn(t.dim)}>{th.locked ? s.panel.forum.kilitAc : s.panel.forum.kilitle}</button>
            {th.status !== "removed" && <button onClick={() => kaldir(th)} style={kucukBtn(t.danger)}>{s.panel.forum.kaldir}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ————— Forum: kullanıcı moderasyonu (ara → yaptırım + geçmiş) —————
function ForumKullaniciModerasyon() {
  const { s } = useLang();
  const [q, setQ] = useState("");
  const [sonuc, setSonuc] = useState([]);
  const [secili, setSecili] = useState(null);
  const [gecmis, setGecmis] = useState([]);
  const [action, setAction] = useState("mute");
  const [gun, setGun] = useState("3");
  const [neden, setNeden] = useState("");

  async function ara(e) { e.preventDefault(); setSonuc(await forumKullaniciAra(q.trim())); }
  async function sec(u) { setSecili(u); setGecmis(await forumYaptirimGecmisi(u.id)); }
  async function uygula() {
    const kalici = action === "ban" && gun === "0";
    const expires = action === "warning" || kalici ? null : new Date(Date.now() + (Number(gun) || 1) * 864e5).toISOString();
    await forumYaptirimUygula(secili.id, action, neden || null, expires);
    setNeden("");
    setGecmis(await forumYaptirimGecmisi(secili.id));
  }

  return (
    <div style={{ marginTop: 48 }}>
      <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 18, marginBottom: 6 }}>{s.panel.forum.kullanici}</div>
      <form onSubmit={ara} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input style={{ ...girisStil, flex: 1 }} placeholder={s.panel.forum.kullaniciAra} value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" style={kucukBtn(t.text)}>{s.panel.forum.araBtn}</button>
      </form>
      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        {sonuc.map((u) => (
          <button key={u.id} onClick={() => sec(u)} style={{ ...kartStil, textAlign: "left", cursor: "pointer", display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{u.display_name}</span>
            <span style={{ color: t.dim, fontSize: 12 }}>{u.role}</span>
            {u.aktif_yaptirim && <span style={{ color: t.danger, fontSize: 12 }}>{u.aktif_yaptirim}</span>}
          </button>
        ))}
      </div>
      {secili && (
        <div style={{ ...kartStil }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{secili.display_name}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <select style={girisStil} value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="warning">{s.panel.forum.uyar}</option>
              <option value="mute">{s.panel.forum.sustur}</option>
              <option value="ban">{s.panel.forum.banla}</option>
            </select>
            {action !== "warning" && (
              <select style={girisStil} value={gun} onChange={(e) => setGun(e.target.value)}>
                <option value="1">1 {s.panel.forum.gun}</option>
                <option value="3">3 {s.panel.forum.gun}</option>
                <option value="7">7 {s.panel.forum.gun}</option>
                <option value="30">30 {s.panel.forum.gun}</option>
                {action === "ban" && <option value="0">{s.panel.forum.kalici}</option>}
              </select>
            )}
            <input style={{ ...girisStil, flex: 1, minWidth: 140 }} placeholder={s.panel.forum.neden} value={neden} onChange={(e) => setNeden(e.target.value)} />
            <button onClick={uygula} style={kucukBtn(t.text)}>{s.panel.forum.uygula}</button>
          </div>
          <div style={{ color: t.dim, fontSize: 12, marginBottom: 6 }}>{s.panel.forum.gecmis}</div>
          <div style={{ display: "grid", gap: 4 }}>
            {gecmis.map((g) => (
              <div key={g.id} style={{ fontSize: 12, color: t.dim }}>
                {new Date(g.created_at).toLocaleDateString(s.locale)} · {g.action}
                {g.expires_at ? ` (→ ${new Date(g.expires_at).toLocaleDateString(s.locale)})` : ` (${s.panel.forum.kalici})`}
                {g.uygulayan ? ` · ${g.uygulayan}` : ""}{g.reason ? ` · ${g.reason}` : ""}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ————— Bağış / Creator Support ayarları (YALNIZ admin; parametrik feature flag) —————
function BagisAyarlari() {
  const { s } = useLang();
  const [a, setA] = useState(null);
  const [kaydedildi, setKaydedildi] = useState(false);
  useEffect(() => {
    getBagisAyarlari().then((d) =>
      setA(d ? { enabled: d.enabled, min: d.min_amount, max: d.max_amount, currency: d.currency, provider: d.provider } : null)
    );
  }, []);
  if (!a) return null;

  async function kaydet() {
    await Promise.all([
      setAppSetting("creator_donations_enabled", a.enabled ? "true" : "false"),
      setAppSetting("creator_donations_min_amount", String(a.min)),
      setAppSetting("creator_donations_max_amount", String(a.max)),
      setAppSetting("creator_donations_currency", a.currency || "USD"),
      setAppSetting("creator_donations_provider", a.provider || ""),
    ]);
    setKaydedildi(true);
    setTimeout(() => setKaydedildi(false), 2000);
  }
  const u = (k, v) => setA((x) => ({ ...x, [k]: v }));

  return (
    <div style={{ marginTop: 48 }}>
      <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 18, marginBottom: 6 }}>{s.panel.bagis.baslik}</div>
      <div style={{ color: t.dim, fontSize: 13, marginBottom: 16 }}>{s.panel.bagis.aciklama}</div>
      <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
          <input type="checkbox" checked={a.enabled} onChange={(e) => u("enabled", e.target.checked)} />
          {s.panel.bagis.aktif}
        </label>
        <Etiketli etiket={s.panel.bagis.min}><input type="number" style={girisStil} value={a.min} onChange={(e) => u("min", e.target.value)} /></Etiketli>
        <Etiketli etiket={s.panel.bagis.max}><input type="number" style={girisStil} value={a.max} onChange={(e) => u("max", e.target.value)} /></Etiketli>
        <Etiketli etiket={s.panel.bagis.para}><input style={girisStil} value={a.currency} onChange={(e) => u("currency", e.target.value)} /></Etiketli>
        <Etiketli etiket={s.panel.bagis.saglayici}><input style={girisStil} value={a.provider} placeholder="none" onChange={(e) => u("provider", e.target.value)} /></Etiketli>
        <div style={{ color: t.dim, fontSize: 12 }}>{s.panel.bagis.not}</div>
        <button onClick={kaydet} style={{ background: t.gradient, color: "#0A0A0B", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 700, justifySelf: "start" }}>
          {kaydedildi ? s.panel.bagis.kaydedildi : s.panel.bagis.kaydet}
        </button>
      </div>
    </div>
  );
}
function Etiketli({ etiket, children }) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ color: t.dim, fontSize: 12 }}>{etiket}</span>
      {children}
    </label>
  );
}
const kartStil = { background: t.surface, border: `1px solid ${t.line}`, borderRadius: 8, padding: "12px 14px" };
const girisStil = { padding: "8px 10px", background: t.surface2, border: `1px solid ${t.line}`, borderRadius: 6, color: t.text, fontSize: 13, outline: "none" };
const kucukBtn = (renk) => ({ background: "none", border: `1px solid ${t.line}`, borderRadius: 6, color: renk, padding: "6px 10px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" });

// ————— Sponsor yönetimi (pre-roll kartları) —————
function Sponsorlar() {
  const { s } = useLang();
  const [liste, setListe] = useState([]);
  const [ad, setAd] = useState("");
  const [mesaj, setMesaj] = useState("");
  const [url, setUrl] = useState("");
  const [hata, setHata] = useState(null);

  async function yenile() {
    // Admin ilkesi aktif+pasif tüm sponsorları getirir
    const { data, error } = await supabase
      .from("sponsors")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setHata(error.message);
    else setListe(data ?? []);
  }

  useEffect(() => {
    yenile();
  }, []);

  async function ekle(e) {
    e.preventDefault();
    const { error } = await supabase
      .from("sponsors")
      .insert({ name: ad, message: mesaj || null, url: url || null });
    if (error) {
      setHata(error.message);
      return;
    }
    setAd("");
    setMesaj("");
    setUrl("");
    yenile();
  }

  async function acKapat(sponsor) {
    await supabase.from("sponsors").update({ active: !sponsor.active }).eq("id", sponsor.id);
    yenile();
  }

  async function sil(sponsor) {
    await supabase.from("sponsors").delete().eq("id", sponsor.id);
    yenile();
  }

  const alanStil = {
    padding: "9px 12px",
    background: t.surface2,
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    color: t.text,
    fontSize: 13,
    outline: "none",
  };

  return (
    <div style={{ marginTop: 48 }}>
      <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 18, marginBottom: 6 }}>
        {s.panel.sponsorBaslik}
      </div>
      <div style={{ color: t.dim, fontSize: 13, marginBottom: 16 }}>
        {s.panel.sponsorAciklama}
      </div>

      {hata && <div style={{ color: t.danger, fontSize: 13, marginBottom: 12 }}>{hata}</div>}

      <form onSubmit={ekle} style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          style={{ ...alanStil, width: 160 }}
          placeholder={s.panel.sponsorAd}
          value={ad}
          onChange={(e) => setAd(e.target.value)}
          required
        />
        <input
          style={{ ...alanStil, flex: 1, minWidth: 180 }}
          placeholder={s.panel.mesaj}
          value={mesaj}
          onChange={(e) => setMesaj(e.target.value)}
        />
        <input
          style={{ ...alanStil, width: 200 }}
          placeholder="https://…"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          type="submit"
          style={{
            background: t.gradient,
            color: "#0A0A0B",
            border: "none",
            borderRadius: 8,
            padding: "9px 16px",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {s.panel.ekle}
        </button>
      </form>

      <div style={{ display: "grid", gap: 8 }}>
        {liste.length === 0 && (
          <div style={{ color: t.dim, fontSize: 13 }}>{s.panel.sponsorYok}</div>
        )}
        {liste.map((sp) => (
          <div
            key={sp.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              background: t.surface,
              border: `1px solid ${t.line}`,
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            <span style={{ fontWeight: 600 }}>{sp.name}</span>
            {sp.message && <span style={{ color: t.dim, flex: 1, minWidth: 0 }}>{sp.message}</span>}
            {!sp.message && <span style={{ flex: 1 }} />}
            <span style={{ color: sp.active ? t.accent : t.dim, fontSize: 12 }}>
              {sp.active ? s.panel.aktif : s.panel.pasif}
            </span>
            <button
              onClick={() => acKapat(sp)}
              style={{
                background: "none",
                border: `1px solid ${t.line}`,
                borderRadius: 6,
                color: t.dim,
                padding: "5px 10px",
                fontSize: 12,
              }}
            >
              {sp.active ? s.panel.durdur : s.panel.surdur}
            </button>
            <button
              onClick={() => sil(sp)}
              style={{
                background: "none",
                border: "none",
                color: t.danger,
                fontSize: 12,
                padding: "5px 4px",
              }}
            >
              {s.panel.sil}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ————— Yarışma yönetimi —————
function Yarismalar() {
  const { s } = useLang();
  const [liste, setListe] = useState([]);
  const [ad, setAd] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [bitis, setBitis] = useState("");
  const [hata, setHata] = useState(null);

  async function yenile() {
    const { data, error } = await supabase
      .from("contests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setHata(error.message);
    else setListe(data ?? []);
  }

  useEffect(() => {
    yenile();
  }, []);

  async function ekle(e) {
    e.preventDefault();
    const { error } = await supabase.from("contests").insert({
      name: ad,
      description: aciklama || null,
      ends_at: bitis ? new Date(bitis).toISOString() : null,
    });
    if (error) {
      setHata(error.message);
      return;
    }
    setAd("");
    setAciklama("");
    setBitis("");
    yenile();
  }

  async function acKapat(yarisma) {
    await supabase.from("contests").update({ active: !yarisma.active }).eq("id", yarisma.id);
    yenile();
  }

  const alanStil = {
    padding: "9px 12px",
    background: t.surface2,
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    color: t.text,
    fontSize: 13,
    outline: "none",
  };

  return (
    <div style={{ marginTop: 48 }}>
      <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 18, marginBottom: 6 }}>
        {s.panel.yarismaBaslik}
      </div>
      <div style={{ color: t.dim, fontSize: 13, marginBottom: 16 }}>
        {s.panel.yarismaAciklama}
      </div>

      {hata && <div style={{ color: t.danger, fontSize: 13, marginBottom: 12 }}>{hata}</div>}

      <form onSubmit={ekle} style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          style={{ ...alanStil, width: 180 }}
          placeholder={s.panel.yarismaAd}
          value={ad}
          onChange={(e) => setAd(e.target.value)}
          required
        />
        <input
          style={{ ...alanStil, flex: 1, minWidth: 180 }}
          placeholder={s.panel.yarismaAciklamaAlan}
          value={aciklama}
          onChange={(e) => setAciklama(e.target.value)}
        />
        <input
          style={{ ...alanStil, width: 150 }}
          type="date"
          value={bitis}
          onChange={(e) => setBitis(e.target.value)}
        />
        <button
          type="submit"
          style={{
            background: t.gradient,
            color: "#0A0A0B",
            border: "none",
            borderRadius: 8,
            padding: "9px 16px",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {s.panel.baslat}
        </button>
      </form>

      <div style={{ display: "grid", gap: 8 }}>
        {liste.length === 0 && (
          <div style={{ color: t.dim, fontSize: 13 }}>{s.panel.yarismaYok}</div>
        )}
        {liste.map((y) => (
          <div
            key={y.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              background: t.surface,
              border: `1px solid ${t.line}`,
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            <span style={{ fontWeight: 600 }}>{y.name}</span>
            <span style={{ color: t.dim, flex: 1, minWidth: 0 }}>
              {y.ends_at
                ? s.panel.bitis(new Date(y.ends_at).toLocaleDateString(s.locale))
                : s.panel.bitisYok}
            </span>
            <span style={{ color: y.active ? t.accent : t.dim, fontSize: 12 }}>
              {y.active ? s.panel.acik : s.panel.kapali}
            </span>
            <button
              onClick={() => acKapat(y)}
              style={{
                background: "none",
                border: `1px solid ${t.line}`,
                borderRadius: 6,
                color: t.dim,
                padding: "5px 10px",
                fontSize: 12,
              }}
            >
              {y.active ? s.panel.kapat : s.panel.yenidenAc}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ————— Denetim kaydı (son durum değişimleri) —————
function DenetimKaydi() {
  const { s } = useLang();
  const [kayitlar, setKayitlar] = useState([]);

  useEffect(() => {
    // sql/09 çalıştırılmadıysa sessizce boş kalır
    supabase
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setKayitlar(data ?? []));
  }, []);

  if (kayitlar.length === 0) return null;

  return (
    <div style={{ marginTop: 48 }}>
      <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 18, marginBottom: 14 }}>
        {s.panel.denetim}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {kayitlar.map((k) => (
          <div
            key={k.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "8px 14px",
              background: t.surface,
              border: `1px solid ${t.line}`,
              borderRadius: 8,
              fontSize: 12,
              color: t.dim,
            }}
          >
            <span style={{ color: t.text, fontWeight: 600 }}>
              {s.panel.eylem[k.eylem] ?? k.eylem}
            </span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
              {k.kayit}
            </span>
            <span>{k.actor ? s.panel.admin : s.panel.sistem}</span>
            <span>{new Date(k.created_at).toLocaleString(s.locale)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
