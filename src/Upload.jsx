// Üretici yükleme ekranı (giriş gerekli).
// Akış: (gerekirse) yeni başlık oluştur → create-upload Edge Function'dan imzalı URL al
// → dosyayı TARAYICIDAN DOĞRUDAN Cloudflare'e gönder (sunucudan geçmez).
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useLang } from "./i18n";
import { t } from "./theme";
import { turAdi } from "./catalog";

export default function Upload({ user, admin }) {
  const { s } = useLang();
  const [basliklarim, setBasliklarim] = useState([]);
  const [secili, setSecili] = useState("yeni"); // "yeni" | mevcut başlık id'si

  // Yeni başlık alanları
  const [ad, setAd] = useState("");
  const [tip, setTip] = useState("kisa_film"); // "kisa_film" | "uzun_film" | "dizi" (kategori)
  const [tur, setTur] = useState("");
  const [yil, setYil] = useState(new Date().getFullYear());
  const [aciklama, setAciklama] = useState("");
  const [haftalik, setHaftalik] = useState(false); // yeni dizi: "her hafta yeni bölüm"
  const [icerikTipi, setIcerikTipi] = useState("ana"); // "ana" (film/bölüm) | "yapim" (BTS)
  const [kurucuIcerigi, setKurucuIcerigi] = useState(false); // yalnız admin: "Kurucu Ekip" etiketi

  // Bölüm alanları
  const [bolumAd, setBolumAd] = useState("");
  const [sezon, setSezon] = useState(1);
  const [bolum, setBolum] = useState(1);
  const [dosya, setDosya] = useState(null);

  const [asama, setAsama] = useState("hazir"); // hazir | gonderiliyor | yuklendi
  const [ilerleme, setIlerleme] = useState(0);
  const [hata, setHata] = useState(null);

  // Üreticinin kendi başlıkları (RLS: creator_id = auth.uid())
  useEffect(() => {
    supabase
      .from("titles")
      .select("id, name, kind")
      .eq("creator_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setBasliklarim(data ?? []));
  }, [user.id]);

  const seciliBaslik = basliklarim.find((b) => b.id === secili);
  const dizi = secili === "yeni" ? tip === "dizi" : seciliBaslik?.kind === "dizi";

  async function gonder(e) {
    e.preventDefault();
    if (!dosya) return;
    setHata(null);
    setAsama("gonderiliyor");
    setIlerleme(0);

    try {
      // 1) Başlık: mevcut ya da yeni (taslak olarak açılır, admin yayınlar)
      let titleId = secili;
      if (secili === "yeni") {
        const { data, error } = await supabase
          .from("titles")
          .insert({
            creator_id: user.id,
            name: ad,
            kind: tip,
            genre: tur || null,
            year: yil || null,
            description: aciklama || null,
            haftalik: tip === "dizi" ? haftalik : false,
            // Yalnız admin işaretleyebilir; sunucu trigger'ı da non-admin'de false'a zorlar
            kurucu_icerigi: admin ? kurucuIcerigi : false,
            status: "draft",
          })
          .select("id")
          .single();
        if (error) throw new Error(s.yukle.hataBaslik(error.message));
        titleId = data.id;
      }

      // 2) Edge Function'dan imzalı yükleme URL'i + videos kaydı
      const { data: yanit, error: fnHata } = await supabase.functions.invoke(
        "create-upload",
        {
          body: {
            title_id: titleId,
            name: bolumAd || null,
            season: dizi && icerikTipi === "ana" ? sezon : null,
            episode: dizi && icerikTipi === "ana" ? bolum : null,
            icerik_tipi: icerikTipi,
          },
        }
      );
      if (fnHata) throw new Error(s.yukle.hataUrl(fnHata.message));

      // 3) Dosyayı doğrudan Cloudflare'e gönder (ilerleme için XHR)
      await new Promise((coz, reddet) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", yanit.uploadURL);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setIlerleme(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? coz()
            : reddet(new Error(s.yukle.hataCf(xhr.status)));
        xhr.onerror = () => reddet(new Error(s.yukle.hataAg));
        const form = new FormData();
        form.append("file", dosya);
        xhr.send(form);
      });

      setAsama("yuklendi");
    } catch (e) {
      setHata(e.message);
      setAsama("hazir");
    }
  }

  const alanStil = {
    width: "100%",
    padding: "11px 14px",
    background: t.surface2,
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    color: t.text,
    fontSize: 14,
    outline: "none",
  };
  const etiketStil = { color: t.dim, fontSize: 13, marginBottom: 6, display: "block" };

  if (asama === "yuklendi") {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: `80px ${t.pad}`, textAlign: "center" }}>
        <div style={{ fontFamily: t.display, fontWeight: 800, fontSize: 26, marginBottom: 12 }}>
          {s.yukle.tamamBaslik}
        </div>
        <div style={{ color: t.dim, fontSize: 15, lineHeight: 1.6 }}>{s.yukle.tamamGovde}</div>
        <button
          onClick={() => {
            setAsama("hazir");
            setDosya(null);
            setIlerleme(0);
          }}
          style={{
            marginTop: 24,
            background: "none",
            border: `1px solid ${t.line}`,
            borderRadius: 8,
            color: t.text,
            padding: "10px 20px",
            fontSize: 14,
          }}
        >
          {s.yukle.yeniYukleme}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={gonder} style={{ maxWidth: 560, margin: "0 auto", padding: t.pad }}>
      <div style={{ fontFamily: t.display, fontWeight: 800, fontSize: 26, marginBottom: 6 }}>
        {s.yukle.baslik}
      </div>
      <div style={{ color: t.dim, fontSize: 14, marginBottom: 28, lineHeight: 1.5 }}>
        {s.yukle.aciklama}
      </div>

      <div style={{ display: "grid", gap: 18 }}>
        <div>
          <label style={etiketStil}>{s.yukle.baslikEtiket}</label>
          <select style={alanStil} value={secili} onChange={(e) => setSecili(e.target.value)}>
            <option value="yeni">{s.yukle.yeniBaslik}</option>
            {basliklarim.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({turAdi(b.kind, s)})
              </option>
            ))}
          </select>
        </div>

        {secili === "yeni" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 12 }}>
              <div>
                <label style={etiketStil}>{s.yukle.ad}</label>
                <input style={alanStil} value={ad} onChange={(e) => setAd(e.target.value)} required />
              </div>
              <div>
                <label style={etiketStil}>{s.yukle.tip}</label>
                <select style={alanStil} value={tip} onChange={(e) => setTip(e.target.value)}>
                  <option value="kisa_film">{s.genel.kisaFilm}</option>
                  <option value="uzun_film">{s.genel.uzunFilm}</option>
                  <option value="dizi">{s.genel.dizi}</option>
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 12 }}>
              <div>
                <label style={etiketStil}>{s.yukle.tur}</label>
                <input style={alanStil} value={tur} onChange={(e) => setTur(e.target.value)} />
              </div>
              <div>
                <label style={etiketStil}>{s.yukle.yil}</label>
                <input
                  style={alanStil}
                  type="number"
                  value={yil}
                  onChange={(e) => setYil(Number(e.target.value))}
                />
              </div>
            </div>
            <div>
              <label style={etiketStil}>{s.yukle.aciklamaEtiket}</label>
              <textarea
                style={{ ...alanStil, minHeight: 80, resize: "vertical" }}
                value={aciklama}
                onChange={(e) => setAciklama(e.target.value)}
              />
            </div>
            {tip === "dizi" && (
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14 }}>
                <input type="checkbox" checked={haftalik} onChange={(e) => setHaftalik(e.target.checked)} />
                <span>
                  {s.yukle.haftalik}
                  <span style={{ display: "block", color: t.dim, fontSize: 12 }}>{s.yukle.haftalikAlt}</span>
                </span>
              </label>
            )}
            {/* Kurucu içeriği: yalnız admin görür/işaretler (şeffaflık etiketi) */}
            {admin && (
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14 }}>
                <input type="checkbox" checked={kurucuIcerigi} onChange={(e) => setKurucuIcerigi(e.target.checked)} />
                <span>
                  {s.yukle.kurucuIcerigi}
                  <span style={{ display: "block", color: t.dim, fontSize: 12 }}>{s.yukle.kurucuIcerigiAlt}</span>
                </span>
              </label>
            )}
          </>
        )}

        <div>
          <label style={etiketStil}>{s.yukle.icerikTipi}</label>
          <select style={alanStil} value={icerikTipi} onChange={(e) => setIcerikTipi(e.target.value)}>
            <option value="ana">{s.yukle.icerikAna}</option>
            <option value="yapim">{s.yukle.icerikYapim}</option>
          </select>
          {icerikTipi === "yapim" && (
            <div style={{ color: t.dim, fontSize: 12, marginTop: 6 }}>{s.yukle.icerikYapimAlt}</div>
          )}
        </div>

        {dizi && icerikTipi === "ana" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={etiketStil}>{s.yukle.sezon}</label>
              <input
                style={alanStil}
                type="number"
                min={1}
                value={sezon}
                onChange={(e) => setSezon(Number(e.target.value))}
              />
            </div>
            <div>
              <label style={etiketStil}>{s.yukle.bolum}</label>
              <input
                style={alanStil}
                type="number"
                min={1}
                value={bolum}
                onChange={(e) => setBolum(Number(e.target.value))}
              />
            </div>
            <div>
              <label style={etiketStil}>{s.yukle.bolumAdi}</label>
              <input style={alanStil} value={bolumAd} onChange={(e) => setBolumAd(e.target.value)} />
            </div>
          </div>
        )}

        <div>
          <label style={etiketStil}>{s.yukle.dosya}</label>
          <input
            style={{ ...alanStil, padding: "9px 14px" }}
            type="file"
            accept="video/*"
            onChange={(e) => setDosya(e.target.files?.[0] ?? null)}
            required
          />
        </div>

        {hata && <div style={{ color: t.danger, fontSize: 13 }}>{hata}</div>}

        {asama === "gonderiliyor" ? (
          <div>
            <div
              style={{
                height: 6,
                background: t.surface2,
                borderRadius: 3,
                overflow: "hidden",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  width: `${ilerleme}%`,
                  height: "100%",
                  background: t.gradient,
                  transition: "width .2s",
                }}
              />
            </div>
            <div style={{ color: t.dim, fontSize: 13 }}>{s.yukle.yukleniyorYuzde(ilerleme)}</div>
          </div>
        ) : (
          <button
            type="submit"
            style={{
              background: t.gradient,
              color: "#0A0A0B",
              border: "none",
              borderRadius: 8,
              padding: "13px 0",
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            {s.yukle.baslat}
          </button>
        )}
      </div>
    </form>
  );
}
