// Bölüm/başlık CANLI SOHBETİ (Twitch-tarzı): konu başlığı YOK, tek sürekli akış, gerçek zamanlı.
// Overlay olarak açılır (desktop sağ drawer / mobil bottom-sheet) — oynatıcıya DOKUNMAZ.
// Yazma YALNIZ forum-post 'sohbet' action'ından geçer (moderasyon FAIL-CLOSED + mute/ban + oda
// kilidi backend'de zorunlu; catalog.js sohbetGonder). Okuma + realtime herkese açık RLS ile.
// Özellikler: Like (RLS + realtime), Reply (parent preview + scroll), Mention (@autocomplete + clickable).
import { useEffect, useRef, useState } from "react";
import {
  sohbetGetir,
  sohbetOdaDurum,
  sohbetGonder,
  sohbetAbone,
  sohbetAbonelikBirak,
  sohbetBegen,
  sohbetBegenKaldir,
  sohbetBegeniAbone,
  sohbetKullaniciAra,
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

// Göreceli zaman (Intl.RelativeTimeFormat → 8 dil otomatik; ekstra i18n gerekmez).
function goreceliZaman(iso, locale) {
  const sn = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale || "en", { numeric: "auto" });
  if (sn < 60) return rtf.format(-Math.floor(sn), "second");
  if (sn < 3600) return rtf.format(-Math.floor(sn / 60), "minute");
  if (sn < 86400) return rtf.format(-Math.floor(sn / 3600), "hour");
  return rtf.format(-Math.floor(sn / 86400), "day");
}

// Mesaj metni: @mention token'larını accent + tıklanabilir span'e çevirir (Discord/Reddit hissi).
function MesajMetni({ metin, onMention }) {
  const parcalar = String(metin ?? "").split(/(@[A-Za-z0-9_.]+)/g);
  return parcalar.map((p, i) => {
    if (/^@[A-Za-z0-9_.]+$/.test(p)) {
      return (
        <span
          key={i}
          onClick={(e) => { e.stopPropagation(); onMention && onMention(p.slice(1)); }}
          style={{ color: t.accent, fontWeight: 600, cursor: "pointer" }}
        >
          {p}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

// ————— Sohbet drawer (desktop sağ panel / mobil bottom-sheet) —————
export default function ForumDrawer({ titleId, episodeId = null, baslikAd, bolumAd, user, girisAc, kapat }) {
  const { s } = useLang();
  const mobil = useMobil();
  // Oda anahtarı: bölüm → 'ep:<video_id>', film/dizi geneli → 'title:<title_id>'.
  const oda = episodeId ? `ep:${episodeId}` : `title:${titleId}`;
  const [mesajlar, setMesajlar] = useState(null);
  const [kilitli, setKilitli] = useState(false);
  const [acildi, setAcildi] = useState(false);
  const [yanitHedef, setYanitHedef] = useState(null); // hangi mesaja yanıt yazılıyor | null
  const [prefill, setPrefill] = useState(null);        // mention tıklama → composer'a ekle {metin, nonce}
  const listeRef = useRef(null);
  const mesajRefleri = useRef({}); // mesaj id → element (reply scroll için)

  // Listeye mesaj ekle (id ile tekilleştir → optimistik gönderim + realtime yankısı çakışmaz).
  function ekle(m) {
    setMesajlar((eski) => {
      if (!eski) return [m];
      if (eski.some((x) => x.id === m.id)) return eski;
      return [...eski, m];
    });
  }

  // İlk yükleme + realtime abonelik (mesaj + beğeni). oda/kullanıcı değişince yeniden kurulur.
  useEffect(() => {
    let aktif = true;
    setMesajlar(null);
    setYanitHedef(null);
    sohbetGetir(oda)
      .then((m) => aktif && setMesajlar(m))
      .catch(() => aktif && setMesajlar([]));
    sohbetOdaDurum(oda).then((k) => aktif && setKilitli(k)).catch(() => {});

    const kanal = sohbetAbone(
      oda,
      // Yeni mesaj: realtime payload'ında hesaplanan alanlar (beğeni) yok → 0/false varsayılan.
      (yeni) => aktif && ekle({ ...yeni, begeni_sayisi: yeni.begeni_sayisi ?? 0, benim_begenim: yeni.benim_begenim ?? false }),
      (guncel) => {
        if (aktif && (guncel.status !== "visible" || guncel.deleted_at)) {
          setMesajlar((eski) => (eski ?? []).filter((x) => x.id !== guncel.id));
        }
      }
    );
    // Beğeni realtime: BAŞKALARININ like/unlike'ı (kendiminki optimistik işlenir → çift sayma yok).
    const begeniKanal = sohbetBegeniAbone(oda, (mesajId, userId, tip) => {
      if (!aktif || userId === user?.id) return;
      setMesajlar((eski) => (eski ?? []).map((x) =>
        x.id === mesajId
          ? { ...x, begeni_sayisi: Math.max(0, (Number(x.begeni_sayisi) || 0) + (tip === "ekle" ? 1 : -1)) }
          : x
      ));
    });

    return () => {
      aktif = false;
      sohbetAbonelikBirak(kanal);
      sohbetAbonelikBirak(begeniKanal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oda, user?.id]);

  // Giriş animasyonu + ESC ile kapat.
  useEffect(() => {
    const r = requestAnimationFrame(() => setAcildi(true));
    const dinle = (e) => e.key === "Escape" && kapat();
    window.addEventListener("keydown", dinle);
    return () => {
      cancelAnimationFrame(r);
      window.removeEventListener("keydown", dinle);
    };
  }, [kapat]);

  // Yeni mesaj gelince en alta kaydır (canlı sohbet davranışı).
  useEffect(() => {
    const el = listeRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mesajlar]);

  // Like aç/kapa — optimistik + RLS (yalnız kendi; duplicate PK 23505 → zaten var, iyimser doğru).
  async function begenDegis(m) {
    if (!user) return girisAc();
    const yeni = !m.benim_begenim;
    const uygula = (aktif) => setMesajlar((eski) => (eski ?? []).map((x) =>
      x.id === m.id
        ? { ...x, benim_begenim: aktif, begeni_sayisi: Math.max(0, (Number(x.begeni_sayisi) || 0) + (aktif ? 1 : -1)) }
        : x));
    uygula(yeni); // optimistik
    const r = yeni ? await sohbetBegen(m.id, user.id, oda) : await sohbetBegenKaldir(m.id, user.id);
    if (r.error && r.error.code !== "23505") uygula(!yeni); // hata → geri al (23505 hariç)
  }

  function mesajaScroll(id) {
    const el = mesajRefleri.current[id];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  const mentionTikla = (nick) => setPrefill({ metin: `@${nick} `, nonce: Date.now() });

  const ust = s.forum.baslik; // başlık HER ZAMAN sadece "Topluluk"

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
            </div>
            <button onClick={kapat} aria-label={s.forum.kapat} style={{ background: "none", border: "none", color: t.dim, fontSize: 20, lineHeight: 1, cursor: "pointer", padding: 4 }}>✕</button>
          </div>
        </div>

        {/* Mesaj akışı (scroll YALNIZ burada; en yeni altta) */}
        <div ref={listeRef} style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14, WebkitOverflowScrolling: "touch" }}>
          {mesajlar === null ? (
            <div style={{ color: t.dim, fontSize: 14 }}>{s.genel.yukleniyor}</div>
          ) : mesajlar.length === 0 ? (
            <div style={{ color: t.dim, fontSize: 14, margin: "auto", textAlign: "center", maxWidth: 240 }}>{s.forum.sohbetBos}</div>
          ) : (
            mesajlar.map((m) => (
              <SohbetMesaj
                key={m.id}
                m={m}
                user={user}
                onBegen={() => begenDegis(m)}
                onYanitla={() => setYanitHedef(m)}
                onScrollTo={mesajaScroll}
                onMention={mentionTikla}
                setRef={(el) => { mesajRefleri.current[m.id] = el; }}
              />
            ))
          )}
        </div>

        {/* Composer — panelin ALTINA sabitlenmiş */}
        <SohbetYazac
          oda={oda}
          user={user}
          girisAc={girisAc}
          kilitli={kilitli}
          ekle={ekle}
          yanitHedef={yanitHedef}
          yanitIptal={() => setYanitHedef(null)}
          prefill={prefill}
        />
      </div>
    </div>
  );
}

// ————— Tek sohbet mesajı: reply preview + nickname/zaman + spoiler + metin(mention) + like/reply —————
function SohbetMesaj({ m, user, onBegen, onYanitla, onScrollTo, onMention, setRef }) {
  const { s } = useLang();
  const [acik, setAcik] = useState(false);
  const gizli = m.is_spoiler && !acik;
  const benimki = user && m.user_id === user.id;
  const begendim = !!m.benim_begenim;
  const sayi = Number(m.begeni_sayisi) || 0;

  return (
    <div ref={setRef} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {/* Reply önizlemesi (parent'a tıkla → scroll). Preview yazma anında yakalandığı için parent silinse de kalır. */}
      {(m.reply_to || m.reply_ozet) && (
        <div
          onClick={() => m.reply_to && onScrollTo(m.reply_to)}
          style={{ display: "flex", alignItems: "center", gap: 6, cursor: m.reply_to ? "pointer" : "default", borderLeft: `2px solid ${t.line}`, paddingLeft: 8, maxWidth: "100%" }}
        >
          <span style={{ color: t.dim, fontSize: 11, flexShrink: 0 }}>↩ {m.reply_nickname || "—"}</span>
          <span style={{ color: t.dim, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{m.reply_ozet || ""}</span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: benimki ? t.accent : t.text }}>{m.nickname || "—"}</span>
        <span style={{ color: t.dim, fontSize: 11 }}>{goreceliZaman(m.created_at, s.locale)}</span>
      </div>

      {/* Spoiler blur + metin (mention render) */}
      <div
        onClick={() => gizli && setAcik(true)}
        style={{ position: "relative", cursor: gizli ? "pointer" : "default", alignSelf: "flex-start", maxWidth: "100%" }}
      >
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color: t.text,
            filter: gizli ? "blur(6px)" : "none",
            userSelect: gizli ? "none" : "auto",
          }}
        >
          <MesajMetni metin={m.mesaj} onMention={onMention} />
        </div>
        {gizli && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: t.accent, whiteSpace: "nowrap" }}>
            {s.forum.spoilerGizli}
          </div>
        )}
      </div>

      {/* Aksiyon satırı: Like (sayı + realtime) + Reply */}
      {!gizli && (
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 2 }}>
          <button
            onClick={onBegen}
            aria-label={s.forum.begen}
            aria-pressed={begendim}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", padding: 0, color: begendim ? t.accent : t.dim, fontSize: 12 }}
          >
            <span style={{ fontSize: 14 }}>{begendim ? "♥" : "♡"}</span>
            {sayi > 0 ? sayi : ""}
          </button>
          <button
            onClick={onYanitla}
            aria-label={s.forum.yanitla}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0, color: t.dim, fontSize: 12 }}
          >
            ↩ {s.forum.yanitla}
          </button>
        </div>
      )}
    </div>
  );
}

// ————— Composer: reply bar + mention autocomplete + Spoiler + gönder ikonu —————
function SohbetYazac({ oda, user, girisAc, kilitli, ekle, yanitHedef, yanitIptal, prefill }) {
  const { s } = useLang();
  const [metin, setMetin] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState(null);
  const [mentionListe, setMentionListe] = useState([]); // autocomplete sonuçları
  const mentionHarita = useRef(new Map()); // lower(display_name) → user id (seçilen mention'lar)
  const ref = useRef(null);

  // Dışarıdan mention tıklama (prefill) → composer'a @nick ekle + focus.
  useEffect(() => {
    if (!prefill) return;
    setMetin((m) => (m ? m.replace(/\s*$/, " ") : "") + prefill.metin);
    ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.nonce]);

  if (!user) {
    return (
      <div style={yazacSar}>
        <button onClick={girisAc} style={anaBtn}>{s.forum.girisGerek}</button>
      </div>
    );
  }
  if (kilitli) {
    return (
      <div style={yazacSar}>
        <div style={{ color: t.dim, fontSize: 13, textAlign: "center", padding: "6px 0" }}>🔒 {s.forum.sohbetKilit}</div>
      </div>
    );
  }

  // Metin değişince: caret'teki @token'ı yakala → mention autocomplete.
  async function metinDegis(deger) {
    setMetin(deger.slice(0, MAX));
    const caret = ref.current?.selectionStart ?? deger.length;
    const eslesme = /(?:^|\s)@([A-Za-z0-9_.]{1,20})$/.exec(deger.slice(0, caret));
    if (eslesme) {
      const sonuc = await sohbetKullaniciAra(eslesme[1]);
      setMentionListe(sonuc);
    } else {
      setMentionListe([]);
    }
  }
  function mentionSec(u) {
    const yeni = metin.replace(/(^|\s)@([A-Za-z0-9_.]{1,20})$/, `$1@${u.display_name} `);
    mentionHarita.current.set(u.display_name.toLowerCase(), u.id);
    setMetin(yeni);
    setMentionListe([]);
    ref.current?.focus();
  }

  async function gonder() {
    const g = metin.trim();
    if (!g || bekliyor) return;
    setBekliyor(true);
    setHata(null);
    // Metinde geçen @nickname'lerden GEÇERLİ id'leri topla (autocomplete'ten seçilenler; silinenler düşer).
    const mentions = [];
    for (const es of g.matchAll(/@([A-Za-z0-9_.]+)/g)) {
      const id = mentionHarita.current.get(es[1].toLowerCase());
      if (id && !mentions.includes(id)) mentions.push(id);
    }
    const r = await sohbetGonder({
      oda,
      content: g,
      is_spoiler: spoiler,
      lang: (s.locale || "en").slice(0, 2),
      reply_to: yanitHedef?.id ?? null,
      mentions,
    });
    setBekliyor(false);
    if (r.hata) return setHata(hataMetni(s, r.kod));
    if (r.mesaj) ekle(r.mesaj); // optimistik (realtime yankısı id ile tekilleştirilir)
    setMetin("");
    setSpoiler(false);
    setMentionListe([]);
    mentionHarita.current.clear();
    yanitIptal && yanitIptal();
    if (ref.current) ref.current.style.height = "auto";
  }
  function tus(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      gonder();
    }
  }
  function boyutla(e) {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
    metinDegis(el.value);
  }

  const kapali = !metin.trim() || bekliyor;
  return (
    <div style={yazacSar}>
      {/* Reply bar */}
      {yanitHedef && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "6px 10px", background: t.surface, border: `1px solid ${t.line}`, borderRadius: 8 }}>
          <span style={{ color: t.dim, fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            ↩ {s.forum.yanitliyor} <b style={{ color: t.text }}>{yanitHedef.nickname}</b>: {String(yanitHedef.mesaj || "").slice(0, 60)}
          </span>
          <button onClick={yanitIptal} aria-label={s.forum.kapat} style={{ background: "none", border: "none", color: t.dim, fontSize: 16, lineHeight: 1, cursor: "pointer", padding: 0 }}>✕</button>
        </div>
      )}

      {/* Mention autocomplete */}
      {mentionListe.length > 0 && (
        <div style={{ marginBottom: 8, background: t.surface2, border: `1px solid ${t.line}`, borderRadius: 10, overflow: "hidden" }}>
          {mentionListe.map((u) => (
            <button key={u.id} type="button" onClick={() => mentionSec(u)} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", color: t.text, padding: "9px 12px", fontSize: 13, cursor: "pointer" }}>
              <span style={{ color: t.accent }}>@</span>{u.display_name}
            </button>
          ))}
        </div>
      )}

      {hata && <div style={{ color: t.danger, fontSize: 12, marginBottom: 6 }}>{hata}</div>}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        <button
          type="button"
          onClick={() => setSpoiler((v) => !v)}
          title={s.forum.spoiler}
          aria-pressed={spoiler}
          style={{ ...ikonBtn, color: spoiler ? t.accent : t.dim, borderColor: spoiler ? t.accent : t.line }}
        >
          ⚠
        </button>
        <textarea
          ref={ref}
          rows={1}
          value={metin}
          onChange={boyutla}
          onKeyDown={tus}
          placeholder={s.forum.sohbetYer}
          maxLength={MAX}
          style={{ ...alan, resize: "none", maxHeight: 120, flex: 1 }}
        />
        <button
          type="button"
          onClick={gonder}
          disabled={kapali}
          aria-label={s.forum.sohbetGonder}
          style={{ ...gonderIkon, opacity: kapali ? 0.5 : 1, cursor: kapali ? "default" : "pointer" }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}

// ————— Stiller —————
const arkaPlan = (mobil) => ({
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 60,
  display: "flex", justifyContent: mobil ? "center" : "flex-end", alignItems: mobil ? "flex-end" : "stretch",
});
const panel = (mobil) => mobil
  ? { width: "100%", height: "82vh", background: t.bg, borderRadius: "16px 16px 0 0", borderTop: `1px solid ${t.line}`, display: "flex", flexDirection: "column", paddingBottom: "env(safe-area-inset-bottom)" }
  : { width: "clamp(380px, 34vw, 460px)", height: "100vh", background: t.bg, borderLeft: `1px solid ${t.line}`, display: "flex", flexDirection: "column" };

const yazacSar = { flexShrink: 0, borderTop: `1px solid ${t.line}`, padding: 12, background: t.bg };
const alan = { width: "100%", padding: "10px 12px", background: t.surface2, border: `1px solid ${t.line}`, borderRadius: 10, color: t.text, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: t.font, lineHeight: 1.4 };
const anaBtn = { width: "100%", background: t.gradient, color: "#0A0A0B", border: "none", borderRadius: 10, padding: "11px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" };
const ikonBtn = { flexShrink: 0, width: 40, height: 40, background: "none", border: `1px solid ${t.line}`, borderRadius: 10, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
const gonderIkon = { flexShrink: 0, width: 40, height: 40, background: t.gradient, color: "#0A0A0B", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" };
