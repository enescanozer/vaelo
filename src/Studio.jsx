// Sanatçı panosu (giriş gerekli): üreticinin kendi başlık/bölümleri, durumları,
// izlenme özeti ve aylık hakediş. Veri: creator_stats() + creator_earnings() (rpc).
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useLang } from "./i18n";
import { t } from "./theme";

// Durum rozet renkleri (etiket metinleri dile göre s.studyo.durum'dan gelir)
const DURUM_RENK = {
  uploading: "#8C8F88",
  processing: "#8C8F88",
  in_review: "#ECEEE9",
  approved: "#FF4DBD",
  rejected: "#E2574C",
};

export default function Studio({ user }) {
  const { s } = useLang();
  const [satirlar, setSatirlar] = useState(null);
  const [aylar, setAylar] = useState([]); // aylık hakediş (rpc: creator_earnings)
  const [hata, setHata] = useState(null);
  const [kopyalandi, setKopyalandi] = useState(false);

  // Üreticiye özel paylaşım linki (?ref=<id>) — bu linkle gelen kayıtlar üreticiye atfedilir
  const paylasimLinki = user ? `${window.location.origin}/?ref=${user.id}` : "";
  async function linkKopyala() {
    try {
      await navigator.clipboard.writeText(paylasimLinki);
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 2000);
    } catch {
      /* pano erişimi reddedilirse sessizce geç */
    }
  }

  useEffect(() => {
    supabase.rpc("creator_stats").then(({ data, error }) => {
      if (error) setHata(error.message);
      else setSatirlar(data ?? []);
    });
    // Hakediş raporu; sql/07 çalıştırılmadıysa sessizce boş kalır
    supabase.rpc("creator_earnings").then(({ data, error }) => {
      if (!error) setAylar(data ?? []);
    });
  }, []);

  if (hata) {
    return (
      <div style={{ padding: `80px ${t.pad}`, textAlign: "center", color: t.danger, fontSize: 14 }}>
        {s.studyo.hata(hata)}
      </div>
    );
  }
  if (satirlar === null) {
    return (
      <div style={{ padding: `80px ${t.pad}`, textAlign: "center", color: t.dim, fontSize: 14 }}>
        {s.genel.yukleniyor}
      </div>
    );
  }

  const toplamIzlenme = satirlar.reduce((a, sat) => a + Number(sat.izlenme), 0);
  const toplamSaat = satirlar.reduce((a, sat) => a + Number(sat.toplam_saniye), 0) / 3600;
  const yayinda = satirlar.filter((sat) => sat.durum === "approved").length;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: t.pad }}>
      <div style={{ fontFamily: t.display, fontWeight: 800, fontSize: 26, marginBottom: 6 }}>
        {s.studyo.baslik}
      </div>
      <div style={{ color: t.dim, fontSize: 14, marginBottom: 28 }}>{s.studyo.aciklama}</div>

      {/* Özet kartları */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 14,
          marginBottom: 36,
        }}
      >
        <OzetKart etiket={s.studyo.toplamIzlenme} deger={toplamIzlenme.toLocaleString(s.locale)} />
        <OzetKart
          etiket={s.studyo.izlenmeSaati}
          deger={toplamSaat.toLocaleString(s.locale, { maximumFractionDigits: 1 })}
        />
        <OzetKart etiket={s.studyo.yayindaBolum} deger={`${yayinda} / ${satirlar.length}`} />
      </div>

      {/* Paylaşım linki: üretici kendi takipçilerini bu linkle çeker, kayıtlar atfedilir */}
      {user && (
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 17, marginBottom: 6 }}>
            {s.studyo.paylasimBaslik}
          </div>
          <div style={{ color: t.dim, fontSize: 13, marginBottom: 12 }}>{s.studyo.paylasimAciklama}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              readOnly
              value={paylasimLinki}
              onFocus={(e) => e.target.select()}
              style={{
                flex: 1,
                minWidth: 240,
                padding: "10px 14px",
                background: t.surface2,
                border: `1px solid ${t.line}`,
                borderRadius: 8,
                color: t.text,
                fontSize: 13,
                outline: "none",
              }}
            />
            <button
              onClick={linkKopyala}
              style={{
                background: kopyalandi ? "none" : t.gradient,
                color: kopyalandi ? t.dim : "#0A0A0B",
                border: kopyalandi ? `1px solid ${t.line}` : "none",
                borderRadius: 8,
                padding: "10px 18px",
                fontSize: 13,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              {kopyalandi ? s.studyo.paylasimKopyalandi : s.studyo.paylasimKopyala}
            </button>
          </div>
        </div>
      )}

      {/* Aylık hakediş (tahmini) */}
      {aylar.length > 0 && (
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 17, marginBottom: 6 }}>
            {s.studyo.hakedis}
          </div>
          <div style={{ color: t.dim, fontSize: 13, marginBottom: 14 }}>
            {s.studyo.hakedisAciklama}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {aylar.map((ay) => (
              <div
                key={ay.ay}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "10px 14px",
                  background: t.surface,
                  border: `1px solid ${t.line}`,
                  borderRadius: 8,
                  fontSize: 13,
                }}
              >
                <span style={{ fontWeight: 600, width: 110 }}>
                  {new Date(ay.ay).toLocaleDateString(s.locale, {
                    month: "long",
                    year: "numeric",
                  })}
                </span>
                <span style={{ color: t.dim, flex: 1 }}>
                  {Number(ay.izlenme).toLocaleString(s.locale)} {s.studyo.izlenme}
                </span>
                <span style={{ fontWeight: 700 }}>
                  ${Number(ay.hakedis).toLocaleString(s.locale, { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {satirlar.length === 0 && (
        <div style={{ color: t.dim, padding: "40px 0", textAlign: "center" }}>
          {s.studyo.bosMesaj}
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {satirlar.map((sat) => (
          <StudioSatiri key={sat.bolum_id} sat={sat} s={s} />
        ))}
      </div>
    </div>
  );
}

// Dil kodu → yerel ad (alt yazı seçicisinde okunur görünsün)
const DIL_ADI = {
  en: "English", ru: "Русский", zh: "中文", ar: "العربية",
  tr: "Türkçe", es: "Español", de: "Deutsch", fr: "Français",
};

// Tek bölüm satırı: bilgi + izlenme + durum, altında alt yazı rozetleri ve ekleme.
function StudioSatiri({ sat, s }) {
  const [captions, setCaptions] = useState(sat.captions ?? []);
  const [formAcik, setFormAcik] = useState(false);
  const [dil, setDil] = useState("en");
  const [dosya, setDosya] = useState(null); // { ad, metin }
  const [asama, setAsama] = useState("hazir"); // hazir | yukleniyor | basarili
  const [hata, setHata] = useState(null);
  // AI ile çok-dilli üretim
  const [aiAcik, setAiAcik] = useState(false);
  const [kaynakDil, setKaynakDil] = useState("en");
  const [aiAsama, setAiAsama] = useState("hazir"); // hazir | calisiyor | uretiliyor | tamam | hata

  // Alt yazı yalnızca CF'de hazır (cf_uid var) bölümlere eklenebilir
  const ccEklenebilir = !!sat.cf_uid;

  function dosyaSec(e) {
    const f = e.target.files?.[0];
    if (!f) return setDosya(null);
    const okuyucu = new FileReader();
    okuyucu.onload = () => setDosya({ ad: f.name, metin: String(okuyucu.result) });
    okuyucu.readAsText(f);
  }

  async function yukle() {
    if (!dosya) return;
    setHata(null);
    setAsama("yukleniyor");
    const { data, error } = await supabase.functions.invoke("add-caption", {
      body: { video_id: sat.bolum_id, lang: dil, vtt: dosya.metin },
    });
    if (error || data?.hata) {
      // invoke 4xx'te error (FunctionsHttpError) döner, data null olur; gerçek
      // {hata} mesajını yanıt gövdesinden çıkar, yoksa generic mesaja düş.
      let mesaj = data?.hata || error?.message || "?";
      if (error?.context) {
        try {
          const govde = await error.context.json();
          if (govde?.hata) mesaj = govde.hata;
        } catch {
          /* gövde JSON değil → error.message kalsın */
        }
      }
      setHata(mesaj);
      setAsama("hazir");
      return;
    }
    setCaptions(data.captions ?? [...captions, dil]);
    setAsama("basarili");
    setDosya(null);
    setTimeout(() => {
      setFormAcik(false);
      setAsama("hazir");
    }, 1500);
  }

  // AI ile üret: CF transkripsiyonu (senkron) + Claude çevirisi (zaman damgaları korunur).
  // İlk çağrı transkripsiyonu başlatır ("uretiliyor"); hazır olunca ikinci çağrı çevirip yükler.
  async function aiUret() {
    setHata(null);
    setAiAsama("calisiyor");
    const { data, error } = await supabase.functions.invoke("generate-captions", {
      body: { video_id: sat.bolum_id, kaynak_dil: kaynakDil },
    });
    if (error || data?.hata) {
      let mesaj = data?.hata || error?.message || "?";
      if (error?.context) {
        try {
          const govde = await error.context.json();
          if (govde?.hata) mesaj = govde.hata;
        } catch {
          /* gövde JSON değil */
        }
      }
      setHata(mesaj);
      setAiAsama("hata");
      return;
    }
    if (data?.durum === "uretiliyor") {
      setAiAsama("uretiliyor"); // transkript sürüyor; kullanıcı birazdan tekrar dener
      return;
    }
    // durum === "tamam"
    if (data?.captions) setCaptions(data.captions);
    setAiAsama("tamam");
    setTimeout(() => {
      setAiAcik(false);
      setAiAsama("hazir");
    }, 1800);
  }

  const alanStil = {
    padding: "8px 10px",
    background: t.surface2,
    border: `1px solid ${t.line}`,
    borderRadius: 6,
    color: t.text,
    fontSize: 13,
    outline: "none",
  };

  return (
    <div
      style={{
        background: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: 8,
        padding: "12px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {sat.baslik_ad}
            {sat.sezon != null && (
              <span style={{ color: t.dim, fontWeight: 400 }}>
                {" "}· {s.genel.seb(sat.sezon, sat.bolum)}
                {sat.bolum_ad ? ` — ${sat.bolum_ad}` : ""}
              </span>
            )}
          </div>
          {/* Mevcut alt yazı dilleri */}
          {captions.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              {captions.map((c) => (
                <span
                  key={c}
                  style={{
                    fontSize: 11,
                    color: t.dim,
                    border: `1px solid ${t.line}`,
                    borderRadius: 4,
                    padding: "2px 7px",
                  }}
                >
                  CC {c.toUpperCase()}
                </span>
              ))}
            </div>
          )}
        </div>
        <span style={{ color: t.dim, fontSize: 13, whiteSpace: "nowrap" }}>
          {Number(sat.izlenme).toLocaleString(s.locale)} {s.studyo.izlenme}
        </span>
        <span
          style={{
            fontSize: 12,
            color: DURUM_RENK[sat.durum] ?? t.dim,
            border: `1px solid ${t.line}`,
            borderRadius: 6,
            padding: "4px 10px",
            whiteSpace: "nowrap",
          }}
        >
          {s.studyo.durum[sat.durum] ?? sat.durum}
        </span>
        {ccEklenebilir && !formAcik && !aiAcik && (
          <>
            <button
              onClick={() => setAiAcik(true)}
              style={{
                background: "none",
                border: `1px solid ${t.accent}`,
                borderRadius: 6,
                color: t.accent,
                padding: "5px 10px",
                fontSize: 12,
                whiteSpace: "nowrap",
              }}
            >
              {s.studyo.ccAiUret}
            </button>
            <button
              onClick={() => setFormAcik(true)}
              style={{
                background: "none",
                border: `1px solid ${t.line}`,
                borderRadius: 6,
                color: t.dim,
                padding: "5px 10px",
                fontSize: 12,
                whiteSpace: "nowrap",
              }}
            >
              {s.studyo.ccEkle}
            </button>
          </>
        )}
      </div>

      {/* AI ile çok-dilli üretim: konuşulan dili seç → CF transkript + Claude çeviri */}
      {aiAcik && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: t.dim, fontSize: 13 }}>{s.studyo.ccKaynakDil}:</span>
          <select style={alanStil} value={kaynakDil} onChange={(e) => setKaynakDil(e.target.value)}>
            {Object.keys(DIL_ADI).map((kod) => (
              <option key={kod} value={kod}>
                {DIL_ADI[kod]}
              </option>
            ))}
          </select>
          {aiAsama === "tamam" ? (
            <span style={{ color: t.accent, fontSize: 13 }}>{s.studyo.ccAiTamam}</span>
          ) : (
            <button
              onClick={aiUret}
              disabled={aiAsama === "calisiyor"}
              style={{
                background: t.gradient,
                color: "#0A0A0B",
                border: "none",
                borderRadius: 6,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 700,
                opacity: aiAsama === "calisiyor" ? 0.5 : 1,
              }}
            >
              {aiAsama === "calisiyor" ? s.studyo.ccBekle : s.studyo.ccUret}
            </button>
          )}
          {aiAsama === "uretiliyor" && (
            <span style={{ color: t.dim, fontSize: 12, flexBasis: "100%" }}>
              {s.studyo.ccUretiliyor}
            </span>
          )}
        </div>
      )}

      {/* Alt yazı yükleme formu */}
      {formAcik && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          <select style={alanStil} value={dil} onChange={(e) => setDil(e.target.value)}>
            {Object.keys(DIL_ADI).map((kod) => (
              <option key={kod} value={kod}>
                {DIL_ADI[kod]}
              </option>
            ))}
          </select>
          <input style={{ ...alanStil, flex: 1, minWidth: 160 }} type="file" accept=".vtt,text/vtt" onChange={dosyaSec} />
          {asama === "basarili" ? (
            <span style={{ color: t.accent, fontSize: 13 }}>{s.studyo.ccBasarili}</span>
          ) : (
            <button
              onClick={yukle}
              disabled={!dosya || asama === "yukleniyor"}
              style={{
                background: t.gradient,
                color: "#0A0A0B",
                border: "none",
                borderRadius: 6,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 700,
                opacity: dosya && asama !== "yukleniyor" ? 1 : 0.5,
              }}
            >
              {asama === "yukleniyor" ? s.studyo.ccBekle : s.studyo.ccYukle}
            </button>
          )}
        </div>
      )}
      {hata && <div style={{ color: t.danger, fontSize: 13, marginTop: 8 }}>{s.studyo.ccHata(hata)}</div>}
    </div>
  );
}

function OzetKart({ etiket, deger }) {
  return (
    <div
      style={{
        background: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: 10,
        padding: "18px 20px",
      }}
    >
      <div style={{ color: t.dim, fontSize: 12, marginBottom: 6 }}>{etiket}</div>
      <div style={{ fontFamily: t.display, fontWeight: 800, fontSize: 24 }}>{deger}</div>
    </div>
  );
}
