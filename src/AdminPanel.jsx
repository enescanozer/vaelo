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
                  : s.genel.film}
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

      {/* Gelir/yarışma/rol/denetim yalnız admin (owner); moderatör yalnız inceleme kuyruğu */}
      {admin && (
        <>
          <Basvurular />
          <Roller />
          <Sponsorlar />
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
                    : s.genel.film}
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
