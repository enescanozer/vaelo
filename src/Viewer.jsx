// İzleyici deneyimi: ana sayfa (hero + arama + raflar), başlık detayı ve oynatıcı.
// Oynatıcı: sponsor pre-roll → Cloudflare iframe + Stream SDK ile gerçek izlenme süresi;
// dizilerde bölüm bitince "sonraki bölüm" geri sayımıyla otomatik geçiş.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useHomeData,
  buildRows,
  getTitle,
  searchTitles,
  getKisiselRaflar,
  inMyList,
  toggleMyList,
  logWatch,
  updateWatchSeconds,
  getActiveSponsor,
  logAd,
  iframeUrl,
  thumbUrl,
  toCard,
  getPlatformMode,
  getPromoBanner,
  getVideoPuan,
  puanVer,
  getUreticiProfil,
  sosyalUrl,
} from "./catalog";
import { useLang } from "./i18n";
import { useAyarlar } from "./ayarlar";
import { t } from "./theme";
import ForumDrawer from "./Forum";

// Cloudflare Stream oynatıcı SDK'sını bir kez yükler (timeupdate/ended için)
let sdkSozu = null;
function streamSdkYukle() {
  if (window.Stream) return Promise.resolve();
  if (!sdkSozu) {
    sdkSozu = new Promise((coz, reddet) => {
      const betik = document.createElement("script");
      betik.src = "https://embed.cloudflarestream.com/embed/sdk.latest.js";
      betik.onload = coz;
      betik.onerror = () => reddet(new Error("Stream SDK yüklenemedi"));
      document.head.appendChild(betik);
    });
  }
  return sdkSozu;
}

// Paylaşılan ?b= bağlantısı yalnızca uygulamanın İLK açılışında uygulanır;
// sonraki sekme dönüşlerinde Keşfet ana sayfadan başlar.
let derinBaglantiKullanildi = false;

export default function Viewer({ user, istenen, anaSinyal, festivalGit, girisAc }) {
  // gorunum: {tip:"ana"} | {tip:"detay", id} | {tip:"oynat", video, baslik, baslangic}
  const [gorunum, setGorunum] = useState(() => {
    const paylasilan =
      !derinBaglantiKullanildi && new URLSearchParams(window.location.search).get("b");
    return paylasilan ? { tip: "detay", id: paylasilan } : { tip: "ana" };
  });
  useEffect(() => {
    derinBaglantiKullanildi = true;
  }, []);

  // Forum: mevcut görünümün ÜSTÜNE overlay (drawer/bottom-sheet) olarak açılır. Böylece
  // oynatıcı yeniden mount edilmez, video durmaz (tam-sayfa forum yaklaşımı kaldırıldı).
  const [forum, setForum] = useState(null); // { titleId, episodeId, baslikAd, bolumAd } | null
  const forumAc = (titleId, episodeId, baslikAd, bolumAd) =>
    setForum({ titleId, episodeId, baslikAd, bolumAd });

  // Logo/Keşfet tıklanınca ana sayfaya dön (mount'taki değer sıfır kabul edilir,
  // yalnızca sonraki artışlar döndürür)
  const oncekiSinyal = useRef(anaSinyal);
  useEffect(() => {
    if (anaSinyal !== oncekiSinyal.current) {
      oncekiSinyal.current = anaSinyal;
      setGorunum({ tip: "ana" });
    }
  }, [anaSinyal]);

  // Başka sekmeden (örn. Yarışma) "izle" istenirse detayı aç
  useEffect(() => {
    if (istenen?.id) setGorunum({ tip: "detay", id: istenen.id });
  }, [istenen]);

  // Adres çubuğunu görünümle eşle: detay/oynatıcıda ?b=<id>, ana sayfada temiz
  useEffect(() => {
    const id =
      gorunum.tip === "detay" ? gorunum.id : gorunum.tip === "oynat" ? gorunum.baslik.id : null;
    window.history.replaceState(null, "", id ? `?b=${id}` : window.location.pathname);
  }, [gorunum]);

  const oynat = (video, baslik, baslangic = 0) =>
    setGorunum({ tip: "oynat", video, baslik, baslangic });

  // Aktif görünüm — erken return YOK; forum drawer bunun ÜSTÜNE overlay olarak eklenir.
  let ekran;
  if (gorunum.tip === "oynat") {
    ekran = (
      <Oynatici
        video={gorunum.video}
        baslik={gorunum.baslik}
        baslangic={gorunum.baslangic}
        user={user}
        oynat={oynat}
        girisAc={girisAc}
        forumAc={forumAc}
        geri={() => setGorunum({ tip: "detay", id: gorunum.baslik.id })}
      />
    );
  } else if (gorunum.tip === "detay") {
    ekran = (
      <Detay
        id={gorunum.id}
        user={user}
        oynat={oynat}
        forumAc={forumAc}
        geri={() => setGorunum({ tip: "ana" })}
      />
    );
  } else {
    ekran = (
      <AnaSayfa
        user={user}
        ac={(id) => setGorunum({ tip: "detay", id })}
        oynat={oynat}
        festivalGit={festivalGit}
      />
    );
  }

  return (
    <>
      {ekran}
      {forum && (
        <ForumDrawer
          titleId={forum.titleId}
          episodeId={forum.episodeId}
          baslikAd={forum.baslikAd}
          bolumAd={forum.bolumAd}
          user={user}
          girisAc={girisAc}
          kapat={() => setForum(null)}
        />
      )}
    </>
  );
}

// ————— Festival (toplama fazı) landing'i: promo banner + iki AYRI CTA (film / sanat) —————
function FestivalKart({ baslik, alt, cta, vurgulu, onClick }) {
  return (
    <div style={{ border: `1px solid ${t.line}`, borderRadius: 14, padding: 22, background: t.surface, display: "flex", flexDirection: "column" }}>
      <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 19 }}>{baslik}</div>
      <div style={{ color: t.dim, fontSize: 14, marginTop: 8, flex: 1, lineHeight: 1.5 }}>{alt}</div>
      <button
        onClick={onClick}
        style={{
          marginTop: 18,
          alignSelf: "flex-start",
          background: vurgulu ? t.gradient : "none",
          color: vurgulu ? "#0A0A0B" : t.text,
          border: vurgulu ? "none" : `1px solid ${t.line}`,
          borderRadius: 8,
          padding: "10px 20px",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {cta}
      </button>
    </div>
  );
}
function FestivalLanding({ s, banner, git, buHaftaRaf, ac }) {
  const f = s.kesfet.festival;
  const bannerLink = /^https?:\/\//i.test(banner?.link_url || "") ? banner.link_url : undefined;
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: `40px ${t.pad} 80px` }}>
      {banner && (
        <a
          href={bannerLink}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "block",
            textDecoration: "none",
            color: "inherit",
            marginBottom: 32,
            border: `1px solid ${t.line}`,
            borderRadius: 14,
            overflow: "hidden",
            background: t.surface,
          }}
        >
          {banner.image_url && (
            <img src={banner.image_url} alt="" style={{ width: "100%", maxHeight: 220, objectFit: "cover", display: "block" }} />
          )}
          <div style={{ padding: 18 }}>
            <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 18 }}>{banner.title}</div>
            {banner.body && <div style={{ color: t.dim, fontSize: 14, marginTop: 6 }}>{banner.body}</div>}
          </div>
        </a>
      )}

      <div style={{ fontFamily: t.display, fontWeight: 800, fontSize: "clamp(28px, 6vw, 44px)", lineHeight: 1.1 }}>
        {f.baslik}
      </div>
      <div style={{ color: t.dim, fontSize: 16, marginTop: 12, lineHeight: 1.5, maxWidth: 560 }}>{f.alt}</div>

      <div style={{ display: "grid", gap: 16, marginTop: 36, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <FestivalKart baslik={f.filmBaslik} alt={f.filmAlt} cta={f.filmCta} vurgulu onClick={() => git("film")} />
        <FestivalKart baslik={f.artBaslik} alt={f.artAlt} cta={f.artCta} onClick={() => git("art")} />
      </div>

      {/* "Bu Hafta Yeni" — festival penceresinde de taze bölümler görünsün (kullanıcı isteği) */}
      {buHaftaRaf?.kartlar?.length > 0 && ac && (
        <div style={{ marginTop: 48 }}>
          <Raf raf={buHaftaRaf} ac={ac} />
        </div>
      )}
    </div>
  );
}

// ————— Ana sayfa: arama + hero + raflar —————
function AnaSayfa({ user, ac, oynat, festivalGit }) {
  const { s } = useLang();
  const { yukleniyor, hero, katalog, hata } = useHomeData();
  // Platform modu (festival ↔ netflix) + aktif promo banner — katalogla aynı önbellek TTL'i
  const [mod, setMod] = useState(null);
  const [banner, setBanner] = useState(null);
  useEffect(() => {
    getPlatformMode().then(setMod).catch(() => setMod("netflix"));
    getPromoBanner().then(setBanner).catch(() => {});
  }, []);
  const [arama, setArama] = useState("");
  const [sonuclar, setSonuclar] = useState(null); // null = arama kapalı
  const [devam, setDevam] = useState([]);
  const [listem, setListem] = useState([]);
  const [oneri, setOneri] = useState([]);
  // Filtre hiyerarşisi: önce tip (Filmler/Diziler), kategoriler ONUN altında
  // ve yalnızca o tipe ait türlerden türetilir.
  const [secTip, setSecTip] = useState("hepsi");
  const [secTur, setSecTur] = useState(null);

  const turListesi = useMemo(() => {
    if (secTip === "hepsi") return [];
    return [
      ...new Set(
        katalog
          .filter((b) => b.kind === secTip)
          .map((b) => b.genre)
          .filter(Boolean)
      ),
    ].sort((a, b) => a.localeCompare(b, s.locale));
  }, [katalog, secTip, s]);

  function tipSec(tip) {
    setSecTip(tip);
    setSecTur(null); // tip değişince kategori sıfırlanır
  }

  // Raf adları dile göre kurulur
  const raflar = useMemo(
    () => buildRows(katalog, { yeni: s.kesfet.yeniEklenenler, diger: s.kesfet.diger, buHafta: s.kesfet.buHaftaYeni }),
    [katalog, s]
  );

  // Arama (küçük gecikmeyle)
  useEffect(() => {
    const sorgu = arama.trim();
    if (sorgu.length < 2) {
      setSonuclar(null);
      return;
    }
    const zamanlayici = setTimeout(() => {
      searchTitles(sorgu)
        .then(setSonuclar)
        .catch(() => setSonuclar([]));
    }, 300);
    return () => clearTimeout(zamanlayici);
  }, [arama]);

  // Kişisel raflar (önbellekli tek çağrı): devam et + Listem + "Sana özel"
  useEffect(() => {
    if (!user) {
      setDevam([]);
      setListem([]);
      setOneri([]);
      return;
    }
    let aktif = true;
    getKisiselRaflar(user.id).then(({ devam: d, listem: l, turler }) => {
      if (!aktif) return;
      setDevam(d);
      setListem(l);
      const sevilen = new Set(turler.slice(0, 3));
      const devamIdleri = new Set(d.map((oge) => oge.baslik.id));
      setOneri(
        katalog
          .filter((b) => sevilen.has(b.genre) && !devamIdleri.has(b.id))
          .slice(0, 12)
      );
    });
    return () => {
      aktif = false;
    };
  }, [user?.id, katalog]);

  // Katalog VE mod yüklenene dek iskelet — netflix↔festival arası titremeyi önler
  if (yukleniyor || mod === null) return <AnaIskelet />;

  // FESTIVAL modu: hero+feed+arama+filtre yerine toplama landing'i (yalnız Home).
  // Nav/sekmeler değişmez; Discover/Upload/Studio/Profile aynı kalır.
  if (mod === "festival") {
    const buHaftaRaf = raflar.find((r) => r.ad === s.kesfet.buHaftaYeni) ?? null;
    return <FestivalLanding s={s} banner={banner} git={festivalGit} buHaftaRaf={buHaftaRaf} ac={ac} />;
  }

  if (hata) {
    // Ham ağ hatası yerine anlaşılır mesaj
    const dostane = hata.includes("Failed to fetch")
      ? s.kesfet.sunucuYok
      : s.kesfet.katalogHata(hata);
    return <Durum mesaj={dostane} />;
  }

  const aramaKutusu = (
    <div style={{ padding: `20px ${t.pad} 0` }}>
      <input
        value={arama}
        onChange={(e) => setArama(e.target.value)}
        placeholder={s.kesfet.ara}
        style={{
          width: 320,
          maxWidth: "100%",
          padding: "10px 14px",
          background: t.surface2,
          border: `1px solid ${t.line}`,
          borderRadius: 8,
          color: t.text,
          fontSize: 14,
          outline: "none",
        }}
      />
    </div>
  );

  // Filtre çubuğu: üst satır tip, alt satır SEÇİLİ TİPİN kategorileri
  // (arama açıkken gizlenir; arama önceliklidir)
  const filtreCubugu = (
    <div style={{ padding: `14px ${t.pad} 0`, display: "grid", gap: 10 }}>
      <div className="raf-seridi" style={{ display: "flex", gap: 8, overflowX: "auto" }}>
        <Cip etiket={s.kesfet.tumu} secili={secTip === "hepsi"} sec={() => tipSec("hepsi")} />
        <Cip etiket={s.kesfet.filmler} secili={secTip === "film"} sec={() => tipSec("film")} />
        <Cip etiket={s.kesfet.diziler} secili={secTip === "dizi"} sec={() => tipSec("dizi")} />
      </div>
      {turListesi.length > 0 && (
        <div className="raf-seridi" style={{ display: "flex", gap: 8, overflowX: "auto" }}>
          {turListesi.map((tur) => (
            <Cip
              key={tur}
              etiket={tur}
              secili={secTur === tur}
              sec={() => setSecTur(secTur === tur ? null : tur)}
            />
          ))}
        </div>
      )}
    </div>
  );

  // Arama açıkken yalnızca sonuç ızgarası
  if (sonuclar !== null) {
    return (
      <div>
        {aramaKutusu}
        <div style={{ padding: `28px ${t.pad} 64px` }}>
          <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 18, marginBottom: 14 }}>
            {s.kesfet.sonuclar}
          </div>
          {sonuclar.length === 0 ? (
            <div style={{ color: t.dim, fontSize: 14 }}>{s.kesfet.sonucYok}</div>
          ) : (
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {sonuclar.map((baslik) => (
                <Kart key={baslik.id} kart={toCard(baslik)} ac={ac} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!hero) return <Durum mesaj={s.kesfet.icerikYok} />;

  // Tip seçiliyken raflar yerine süzülmüş ızgara (kategori isteğe bağlı daraltır)
  const suzgecAktif = secTip !== "hepsi";
  if (suzgecAktif) {
    const suzulmus = katalog.filter(
      (b) => b.kind === secTip && (secTur === null || b.genre === secTur)
    );
    return (
      <div>
        {aramaKutusu}
        {filtreCubugu}
        <div style={{ padding: `28px ${t.pad} 64px` }}>
          <div
            style={{ fontFamily: t.display, fontWeight: 700, fontSize: 18, marginBottom: 14 }}
          >
            {s.kesfet.baslikSayisi(suzulmus.length)}
          </div>
          {suzulmus.length === 0 ? (
            <div style={{ color: t.dim, fontSize: 14 }}>{s.kesfet.sonucYok}</div>
          ) : (
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {suzulmus.map((baslik) => (
                <Kart key={baslik.id} kart={toCard(baslik)} ac={ac} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const heroKapak = hero.videos[0]?.cf_uid ? thumbUrl(hero.videos[0].cf_uid) : null;

  return (
    <div>
      {aramaKutusu}
      {filtreCubugu}

      {/* Hero */}
      <div
        onClick={() => ac(hero.id)}
        style={{
          position: "relative",
          height: "clamp(380px, 52vh, 520px)",
          cursor: "pointer",
          marginTop: 20,
          background: heroKapak
            ? `linear-gradient(to top, ${t.bg} 5%, rgba(10,10,11,0.55) 45%, rgba(10,10,11,0.15) 100%), url(${heroKapak}) center/cover`
            : `linear-gradient(to top, ${t.bg}, ${t.surface2})`,
          display: "flex",
          alignItems: "flex-end",
        }}
      >
        <div style={{ padding: `0 ${t.pad} 48px`, maxWidth: 640 }}>
          <div style={{ color: t.dim, fontSize: 13, letterSpacing: 1, marginBottom: 8 }}>
            {[hero.kind === "dizi" ? s.genel.DIZI : s.genel.FILM, hero.genre, hero.year]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <div
            style={{
              fontFamily: t.display,
              fontWeight: 800,
              fontSize: "clamp(30px, 5vw, 44px)",
              lineHeight: 1.1,
              marginBottom: 12,
            }}
          >
            {hero.name}
          </div>
          {hero.description && (
            <div
              style={{
                color: t.dim,
                fontSize: 15,
                lineHeight: 1.5,
                marginBottom: 20,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {hero.description}
            </div>
          )}
          <button
            style={{
              background: t.gradient,
              color: "#0A0A0B",
              border: "none",
              borderRadius: 8,
              padding: "12px 28px",
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            {s.kesfet.izle}
          </button>
        </div>
      </div>

      {/* Raflar */}
      <div style={{ padding: `32px ${t.pad} 64px`, display: "grid", gap: 36 }}>
        {devam.length > 0 && <DevamRafi ogeler={devam} oynat={oynat} />}
        {listem.length > 0 && (
          <Raf raf={{ ad: s.kesfet.listem, kartlar: listem.map(toCard) }} ac={ac} />
        )}
        {oneri.length > 0 && (
          <Raf raf={{ ad: s.kesfet.sanaOzel, kartlar: oneri.map(toCard) }} ac={ac} />
        )}
        {raflar.map((raf) => (
          <Raf key={raf.ad} raf={raf} ac={ac} />
        ))}
      </div>
    </div>
  );
}

// Ana sayfa yüklenirken nabız atan iskelet (metin yerine düzenin hayaleti)
function AnaIskelet() {
  return (
    <div>
      <div style={{ padding: `20px ${t.pad} 0` }}>
        <div className="iskelet" style={{ width: 320, maxWidth: "100%", height: 40 }} />
      </div>
      <div className="iskelet" style={{ height: 420, marginTop: 20, borderRadius: 0 }} />
      <div style={{ padding: `32px ${t.pad} 64px` }}>
        <div className="iskelet" style={{ width: 160, height: 20, marginBottom: 16 }} />
        <div style={{ display: "flex", gap: 14, overflow: "hidden" }}>
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="iskelet"
              style={{ width: 210, height: 118, flexShrink: 0 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// "İzlemeye devam et" — kaldığı yerden, ilerleme çubuğuyla
function DevamRafi({ ogeler, oynat }) {
  const { s } = useLang();
  return (
    <div>
      <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 18, marginBottom: 14 }}>
        {s.kesfet.devamEt}
      </div>
      <div className="raf-seridi" style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 6 }}>
        {ogeler.map(({ video, baslik, saniye }) => {
          const sure = Number(video.duration_seconds) || 0;
          const oran = sure > 0 ? Math.min(1, saniye / sure) : 0;
          return (
            <div
              key={video.id}
              className="kart"
              onClick={() => oynat(video, baslik, saniye)}
              style={{ width: 210, flexShrink: 0, cursor: "pointer" }}
            >
              <div
                style={{
                  height: 118,
                  borderRadius: 8,
                  overflow: "hidden",
                  position: "relative",
                  background: `linear-gradient(135deg, hsl(${adTonu(baslik.name || "?")}, 45%, 24%), hsl(${adTonu(baslik.name || "?")}, 52%, 13%))`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    fontFamily: t.display,
                    fontWeight: 800,
                    fontSize: 54,
                    color: `hsl(${adTonu(baslik.name || "?")}, 58%, 52%)`,
                    opacity: 0.45,
                  }}
                >
                  {baslik.name?.[0]?.toUpperCase()}
                </span>
                {video.cf_uid && (
                  <img
                    src={thumbUrl(video.cf_uid)}
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
                {/* İlerleme çubuğu */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: 4,
                    background: "rgba(255,255,255,0.15)",
                  }}
                >
                  <div style={{ width: `${oran * 100}%`, height: "100%", background: t.gradient }} />
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600 }}>{baslik.name}</div>
              <div style={{ color: t.dim, fontSize: 12, marginTop: 2 }}>
                {baslik.kind === "dizi"
                  ? `${s.genel.seb(video.season ?? 1, video.episode ?? 1)} · ${s.kesfet.kaldiginYerden}`
                  : s.kesfet.kaldiginYerden}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Raf({ raf, ac }) {
  return (
    <div>
      <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 18, marginBottom: 14 }}>
        {raf.ad}
      </div>
      <div className="raf-seridi" style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 6 }}>
        {raf.kartlar.map((kart) => (
          <Kart key={kart.id} kart={kart} ac={ac} />
        ))}
      </div>
    </div>
  );
}

// Başlık adından belirlenimci ton (0-359) — kapak yokken her başlığa ayrı temalı
// poster rengi. Gerçek kapak (cf_uid) gelince img bunun üstünü örter.
function adTonu(ad = "?") {
  let h = 0;
  for (let i = 0; i < ad.length; i++) h = (h * 31 + ad.charCodeAt(i)) % 360;
  return h;
}

function Kart({ kart, ac }) {
  const { s } = useLang();
  const ton = adTonu(kart.ad || "?");
  return (
    <div
      className="kart"
      onClick={() => ac(kart.id)}
      style={{ width: 210, flexShrink: 0, cursor: "pointer" }}
    >
      <div
        style={{
          height: 118,
          borderRadius: 8,
          overflow: "hidden",
          position: "relative",
          background: `linear-gradient(135deg, hsl(${ton}, 45%, 24%), hsl(${ton}, 52%, 13%))`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Temalı poster harfi altta durur; kapak yüklenirse üstünü örter,
            yüklenemezse (kırık görsel) kendini gizler ve poster görünür */}
        <span
          style={{
            fontFamily: t.display,
            fontWeight: 800,
            fontSize: 54,
            color: `hsl(${ton}, 58%, 52%)`,
            opacity: 0.45,
          }}
        >
          {kart.ad?.[0]?.toUpperCase()}
        </span>
        {kart.kapak && (
          <img
            src={kart.kapak}
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
        {kart.haftalik && (
          <span
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              padding: "3px 8px",
              borderRadius: 999,
              background: t.gradient,
              color: "#0A0A0B",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 0.3,
            }}
          >
            {s.kesfet.haftalikRozet}
          </span>
        )}
      </div>
      <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600 }}>{kart.ad}</div>
      <div style={{ color: t.dim, fontSize: 12, marginTop: 2 }}>
        {[kart.tip === "dizi" ? s.genel.dizi : s.genel.film, kart.tur]
          .filter(Boolean)
          .join(" · ")}
      </div>
    </div>
  );
}

// ————— Başlık detayı —————
function Detay({ id, user, oynat, forumAc, geri }) {
  const { s } = useLang();
  const [baslik, setBaslik] = useState(null);
  const [hata, setHata] = useState(null);
  const [ekli, setEkli] = useState(null); // null: bilinmiyor, true/false: Listem durumu
  const [kopyalandi, setKopyalandi] = useState(false);
  const [uretici, setUretici] = useState(null); // üretici herkese açık kartı (ad + sosyal)

  async function paylas() {
    const url = `${window.location.origin}${window.location.pathname}?b=${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 2000);
    } catch {
      /* pano erişimi reddedilirse sessizce geç */
    }
  }

  useEffect(() => {
    let aktif = true;
    getTitle(id)
      .then((b) => {
        if (!aktif) return;
        setBaslik(b);
        // Üretici kartını (ad + sosyal) getir — yalnız yayınlanmış başlığın üreticisi
        setUretici(null);
        if (b?.creator_id) getUreticiProfil(b.creator_id).then((u) => aktif && setUretici(u));
      })
      .catch((e) => aktif && setHata(e.message));
    if (user) {
      inMyList(user.id, id).then((e) => aktif && setEkli(e));
    }
    return () => {
      aktif = false;
    };
  }, [id, user?.id]);

  // Sekme başlığını içerikle eşle (paylaşılan sekmelerde ad görünsün)
  useEffect(() => {
    if (!baslik) return;
    document.title = `${baslik.name} — Vaelo`;
    return () => {
      document.title = s.belgeBasligi;
    };
  }, [baslik, s]);

  async function listemDegistir() {
    if (!user || ekli === null) return;
    setEkli(!ekli); // iyimser güncelleme
    await toggleMyList(user.id, id, ekli);
  }

  if (hata) return <Durum mesaj={s.kesfet.baslikHata(hata)} geri={geri} />;
  if (!baslik) return <Durum mesaj={s.genel.yukleniyor} geri={geri} />;

  const dizi = baslik.kind === "dizi";
  const backdrop = baslik.videos[0]?.cf_uid ? thumbUrl(baslik.videos[0].cf_uid) : null;

  return (
    <div>
      {/* Sinematik başlık sayfası: full-width kapak backdrop + degrade */}
      <div
        style={{
          position: "relative",
          minHeight: "clamp(320px, 46vh, 460px)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: backdrop
            ? `linear-gradient(to top, ${t.bg} 6%, rgba(10,10,11,0.55) 55%, rgba(10,10,11,0.2) 100%), url(${backdrop}) center 30%/cover`
            : `linear-gradient(to top, ${t.bg} 8%, hsl(${adTonu(baslik.name || "?")}, 42%, 16%) 100%)`,
        }}
      >
        <div style={{ padding: `20px ${t.pad} 0` }}>
          <GeriButon geri={geri} />
        </div>
        <div style={{ padding: `0 ${t.pad} 28px` }}>
          <div style={{ color: t.dim, fontSize: 13, letterSpacing: 1, marginBottom: 8 }}>
            {[dizi ? s.genel.DIZI : s.genel.FILM, baslik.genre, baslik.year]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <div
            style={{
              fontFamily: t.display,
              fontWeight: 800,
              fontSize: "clamp(30px, 6vw, 52px)",
              lineHeight: 1.05,
              maxWidth: 760,
            }}
          >
            {baslik.name}
          </div>
        </div>
      </div>

      <div style={{ padding: `24px ${t.pad} 64px` }}>
        {/* Kurucu Ekip etiketi (şeffaflık) — kurucu/admin içeriği açıkça belirtilir */}
        {baslik.kurucu_icerigi && (
          <div style={{ marginBottom: 20 }}>
            <span
              style={{
                display: "inline-block",
                padding: "5px 12px",
                borderRadius: 999,
                background: t.gradient,
                color: "#0A0A0B",
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 0.3,
              }}
            >
              {s.kesfet.kurucuEkip}
            </span>
          </div>
        )}

        <Aciklama metin={baslik.description} />

        {/* Üretici kartı — açıklamanın ALTINDA SÜREKLİ AÇIK (buton/modal YOK) */}
        <div style={{ marginBottom: 28 }}>
          <UreticiKarti uretici={uretici} />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: dizi ? 32 : 0 }}>
        {!dizi && baslik.videos[0] && (
          <button
            onClick={() => oynat(baslik.videos[0], baslik)}
            style={{
              background: t.gradient,
              color: "#0A0A0B",
              border: "none",
              borderRadius: 8,
              padding: "12px 28px",
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            {s.kesfet.filmiIzle}
          </button>
        )}
        {user && ekli !== null && (
          <button
            onClick={listemDegistir}
            style={{
              background: "none",
              border: `1px solid ${t.line}`,
              borderRadius: 8,
              color: ekli ? t.dim : t.text,
              padding: "12px 20px",
              fontSize: 14,
            }}
          >
            {ekli ? s.kesfet.listemde : s.kesfet.listemeEkle}
          </button>
        )}
        <button
          onClick={paylas}
          style={{
            background: "none",
            border: `1px solid ${t.line}`,
            borderRadius: 8,
            color: kopyalandi ? t.dim : t.text,
            padding: "12px 20px",
            fontSize: 14,
          }}
        >
          {kopyalandi ? s.kesfet.kopyalandi : s.kesfet.paylas}
        </button>
        {/* Topluluk (film/dizi geneli forum) */}
        <button
          onClick={() => forumAc(baslik.id, null, baslik.name)}
          style={{
            background: "none",
            border: `1px solid ${t.line}`,
            borderRadius: 8,
            color: t.text,
            padding: "12px 20px",
            fontSize: 14,
          }}
        >
          {s.forum.baslik}
        </button>
      </div>

      {dizi && (
        <div style={{ display: "grid", gap: 10 }}>
          {baslik.videos.map((video) => (
            <div
              key={video.id}
              onClick={() => oynat(video, baslik)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "14px 18px",
                background: t.surface,
                border: `1px solid ${t.line}`,
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              <span style={{ color: t.dim, fontSize: 13, width: 56, flexShrink: 0 }}>
                {s.genel.seb(video.season ?? 1, video.episode ?? 1)}
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>
                {video.name || s.genel.bolumNo(video.episode ?? 1)}
              </span>
              {/* Bölüm Topluluğu (satır tıklaması oynatır → stopPropagation) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  forumAc(baslik.id, video.id, baslik.name, video.name || s.genel.bolumNo(video.episode ?? 1));
                }}
                title={s.forum.bolumBaslik}
                style={{ background: "none", border: "none", color: t.dim, fontSize: 15, cursor: "pointer", padding: "0 4px" }}
              >
                💬
              </button>
              <span style={{ color: t.dim, fontSize: 13 }}>▶</span>
            </div>
          ))}
        </div>
      )}

      {/* Yapım Süreci (BTS) — ana bölümlerden ayrı, çapraz bağlı (M3) */}
      {baslik.yapimlar?.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 18, marginBottom: 12 }}>
            {s.kesfet.yapimSureci}
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {baslik.yapimlar.map((video) => (
              <div
                key={video.id}
                onClick={() => oynat(video, baslik)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "14px 18px",
                  background: t.surface,
                  border: `1px solid ${t.line}`,
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 15, width: 56, flexShrink: 0, textAlign: "center" }}>🎬</span>
                <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>
                  {video.name || s.kesfet.yapimSureci}
                </span>
                <span style={{ color: t.dim, fontSize: 13 }}>▶</span>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// Açıklama: kısa gösterim + "Daha fazla / daha az" (line-clamp). Açıklama yoksa hiç render etme.
function Aciklama({ metin }) {
  const { s } = useLang();
  const [acik, setAcik] = useState(false);
  if (!metin) return null;
  const uzun = metin.length > 160;
  return (
    <div style={{ marginBottom: 28, maxWidth: 640 }}>
      <div
        style={{
          color: t.dim,
          fontSize: 15,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          ...(acik || !uzun
            ? {}
            : { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }),
        }}
      >
        {metin}
      </div>
      {uzun && (
        <button
          onClick={() => setAcik((v) => !v)}
          style={{ background: "none", border: "none", color: t.text, fontSize: 13, padding: "6px 0 0", cursor: "pointer", fontWeight: 600 }}
        >
          {acik ? s.kesfet.dahaAz : s.kesfet.dahaFazla}
        </button>
      )}
    </div>
  );
}

// Baş harf tabanlı avatar (profiles'ta avatar alanı yok → belirlenimci renkli daire)
function Avatar({ ad, boyut = 40 }) {
  const ton = adTonu(ad || "?");
  return (
    <div
      style={{
        width: boyut,
        height: boyut,
        borderRadius: "50%",
        flexShrink: 0,
        background: `linear-gradient(135deg, hsl(${ton}, 45%, 30%), hsl(${ton}, 52%, 18%))`,
        color: `hsl(${ton}, 60%, 70%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: t.display,
        fontWeight: 800,
        fontSize: boyut * 0.42,
      }}
    >
      {(ad?.[0] || "?").toUpperCase()}
    </div>
  );
}

// Üretici kartı — video/başlık açıklamasının ALTINDA SÜREKLİ AÇIK gösterilir (buton/modal YOK).
// Kaynak: public uretici_kartlari view'ı. Profile (kendi profilini düzenleme) sistemine dokunulmaz.
function UreticiKarti({ uretici }) {
  const { s } = useLang();
  if (!uretici) return null;
  const linkler = [
    ["instagram", "Instagram", uretici.instagram],
    ["tiktok", "TikTok", uretici.tiktok],
    ["youtube", "YouTube", uretici.youtube],
    ["twitter", "X", uretici.twitter],
    ["website", s.kesfet.website, uretici.website],
  ].filter(([p, , ham]) => sosyalUrl(p, ham));
  // Gösterilecek içerik yoksa kartı hiç render etme
  if (!uretici.display_name && !uretici.bio && linkler.length === 0) return null;
  return (
    <div
      style={{
        maxWidth: 640,
        padding: 20,
        background: t.surface2,
        border: `1px solid ${t.line}`,
        borderRadius: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Avatar ad={uretici.display_name} boyut={48} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: t.accent,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.7,
              textTransform: "uppercase",
            }}
          >
            {s.kesfet.uretici}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, fontFamily: t.display, marginTop: 1 }}>
            {uretici.display_name || s.kesfet.uretici}
          </div>
        </div>
      </div>

      {uretici.bio && (
        <div style={{ color: t.dim, fontSize: 14, lineHeight: 1.6, marginTop: 14, whiteSpace: "pre-wrap" }}>
          {uretici.bio}
        </div>
      )}

      {linkler.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
          {linkler.map(([p, etiket, ham]) => (
            <a
              key={p}
              href={sosyalUrl(p, ham)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, color: t.text, textDecoration: "none", padding: "7px 14px", border: `1px solid ${t.line}`, borderRadius: 999, background: t.surface }}
            >
              {etiket}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ————— Oynatıcı: sponsor pre-roll → CF iframe + SDK ile gerçek izlenme süresi —————
function Oynatici({ video, baslik, baslangic = 0, user, oynat, geri, girisAc, forumAc }) {
  const { s, dil } = useLang();
  const { ayarlar } = useAyarlar();
  const iframeRef = useRef(null);
  // Alt yazı tercihi video AÇILIRKEN bir kez sabitlenir: aksi halde izlerken
  // ⚙'den dil/alt yazı değişince iframe src değişir ve video başa sarardı.
  const [altyaziDil] = useState(() =>
    ayarlar.altyaziAcik ? ayarlar.altyaziDil || dil : ""
  );
  const [asama, setAsama] = useState("sponsor"); // "sponsor" | "video"
  const [sponsor, setSponsor] = useState(undefined); // undefined: yükleniyor, null: yok
  const [sponsorKaldi, setSponsorKaldi] = useState(5);
  const [sonraki, setSonraki] = useState(null); // bölüm bitince: { video, baslik }
  const [geriSayim, setGeriSayim] = useState(null);

  // Video-altı creator metadata — player/iframe/SDK mantığından TAMAMEN BAĞIMSIZ ayrı fetch.
  // (uretici state'i değişince iframe render'ı etkilenmez → oynatıcı reset OLMAZ.)
  const [uretici, setUretici] = useState(null);
  useEffect(() => {
    let aktif = true;
    setUretici(null);
    if (baslik?.creator_id) getUreticiProfil(baslik.creator_id).then((u) => aktif && setUretici(u));
    return () => {
      aktif = false;
    };
  }, [baslik?.creator_id]);

  // Pre-roll: aktif sponsor varsa 5 sn'lik kart, yoksa doğrudan video
  useEffect(() => {
    let aktif = true;
    setAsama("sponsor");
    setSponsor(undefined);
    setSonraki(null);
    setGeriSayim(null);
    getActiveSponsor().then((sp) => {
      if (!aktif) return;
      if (!sp) {
        setSponsor(null);
        setAsama("video");
        return;
      }
      setSponsor(sp);
      setSponsorKaldi(5);
      logAd(sp.id, video.id, user?.id ?? null, "impression");
    });
    return () => {
      aktif = false;
    };
  }, [video.id]);

  // Sponsor geri sayımı; sıfırlanınca video başlar
  useEffect(() => {
    if (asama !== "sponsor" || !sponsor) return;
    if (sponsorKaldi <= 0) {
      setAsama("video");
      return;
    }
    const zamanlayici = setTimeout(() => setSponsorKaldi((k) => k - 1), 1000);
    return () => clearTimeout(zamanlayici);
  }, [sponsorKaldi, sponsor, asama]);

  // Video aşaması: izlenme kaydı + SDK ile süre takibi + bitişte sonraki bölüm
  useEffect(() => {
    if (asama !== "video") return;
    let iptal = false;
    let temizle = () => {};
    let olayId = null;
    // İzlenen en ileri saniye; 15 sn'de bir ve kapanışta veritabanına yazılır
    const ilerleme = { deger: Math.floor(baslangic), yazilan: -1 };

    logWatch(video.id, user?.id ?? null, 0).then((id) => {
      if (!iptal) olayId = id;
    });

    streamSdkYukle()
      .then(() => {
        if (iptal || !iframeRef.current || !window.Stream) return;
        const oynatici = window.Stream(iframeRef.current);

        oynatici.addEventListener("timeupdate", () => {
          const saniye = Math.floor(oynatici.currentTime || 0);
          if (saniye > ilerleme.deger) ilerleme.deger = saniye;
        });

        const yaz = () => {
          // Yalnızca girişli kullanıcıda olay id'si olur; anonimde görüntülenme yeter
          if (olayId && ilerleme.deger !== ilerleme.yazilan) {
            ilerleme.yazilan = ilerleme.deger;
            updateWatchSeconds(olayId, ilerleme.deger);
          }
        };
        const sayac = setInterval(yaz, 15000);

        oynatici.addEventListener("ended", async () => {
          yaz();
          // Dizide sıradaki bölümü bul, geri sayımla öner
          if (baslik.kind !== "dizi") return;
          try {
            const tam = await getTitle(baslik.id);
            const sira = tam.videos.findIndex((v) => v.id === video.id);
            if (!iptal && sira >= 0 && tam.videos[sira + 1]) {
              setSonraki({ video: tam.videos[sira + 1], baslik: tam });
              setGeriSayim(5);
            }
          } catch {
            /* sonraki bölüm bulunamazsa sessizce geç */
          }
        });

        temizle = () => {
          clearInterval(sayac);
          yaz();
        };
      })
      .catch(() => {
        // SDK yüklenemezse video yine oynar, yalnızca süre takibi yapılmaz
      });

    return () => {
      iptal = true;
      temizle();
    };
  }, [video.id, asama]);

  // Sonraki bölüm geri sayımı; sıfırlanınca otomatik geçiş
  useEffect(() => {
    if (geriSayim === null || !sonraki) return;
    if (geriSayim <= 0) {
      oynat(sonraki.video, sonraki.baslik);
      return;
    }
    const zamanlayici = setTimeout(() => setGeriSayim((k) => k - 1), 1000);
    return () => clearTimeout(zamanlayici);
  }, [geriSayim, sonraki]);

  function sponsorTikla() {
    if (!sponsor?.url) return;
    // Yalnız http/https aç (javascript:/data: gibi şemaları engelle)
    if (!/^https?:\/\//i.test(String(sponsor.url).trim())) return;
    logAd(sponsor.id, video.id, user?.id ?? null, "click");
    window.open(sponsor.url, "_blank", "noopener");
  }

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: `32px ${t.pad} 64px` }}>
      <GeriButon geri={geri} />
      <div style={{ margin: "24px 0 16px" }}>
        <span style={{ fontFamily: t.display, fontWeight: 700, fontSize: 22 }}>
          {baslik.name}
        </span>
        {baslik.kind === "dizi" && (
          <span style={{ color: t.dim, fontSize: 15, marginLeft: 12 }}>
            {s.genel.seb(video.season ?? 1, video.episode ?? 1)}
            {video.name ? ` — ${video.name}` : ""}
          </span>
        )}
      </div>

      <div
        style={{
          position: "relative",
          paddingTop: "56.25%",
          background: "#000",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {/* Sponsor pre-roll kartı */}
        {asama === "sponsor" && sponsor && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              background: t.surface2,
              textAlign: "center",
              padding: 24,
            }}
          >
            <div style={{ color: t.dim, fontSize: 12, letterSpacing: 2 }}>
              {s.oynatici.sponsorlu}
            </div>
            <div style={{ fontFamily: t.display, fontWeight: 800, fontSize: 32 }}>
              {sponsor.name}
            </div>
            {sponsor.message && (
              <div style={{ color: t.dim, fontSize: 15, maxWidth: 480 }}>{sponsor.message}</div>
            )}
            {sponsor.url && (
              <button
                onClick={sponsorTikla}
                style={{
                  background: "none",
                  border: `1px solid ${t.line}`,
                  borderRadius: 8,
                  color: t.text,
                  padding: "9px 18px",
                  fontSize: 14,
                  marginTop: 4,
                }}
              >
                {s.oynatici.sponsoruZiyaret}
              </button>
            )}
            <div style={{ color: t.dim, fontSize: 13, marginTop: 12 }}>
              {s.oynatici.baslayacak(sponsorKaldi)}
            </div>
          </div>
        )}

        {/* Video */}
        {asama === "video" && (
          <iframe
            ref={iframeRef}
            src={iframeUrl(video.cf_uid, { baslangic, altyaziDil })}
            title={baslik.name}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
            allowFullScreen
          />
        )}

        {/* Sonraki bölüm önerisi */}
        {sonraki && (
          <div
            style={{
              position: "absolute",
              right: 16,
              bottom: 16,
              background: "rgba(10,10,11,0.92)",
              border: `1px solid ${t.line}`,
              borderRadius: 10,
              padding: 16,
              maxWidth: 320,
            }}
          >
            <div style={{ color: t.dim, fontSize: 12, marginBottom: 6 }}>
              {s.oynatici.sonrakiBolum(geriSayim)}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
              {s.genel.seb(sonraki.video.season ?? 1, sonraki.video.episode ?? 1)}
              {sonraki.video.name ? ` — ${sonraki.video.name}` : ""}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => oynat(sonraki.video, sonraki.baslik)}
                style={{
                  background: t.gradient,
                  color: "#0A0A0B",
                  border: "none",
                  borderRadius: 6,
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {s.oynatici.simdiOynat}
              </button>
              <button
                onClick={() => {
                  setSonraki(null);
                  setGeriSayim(null);
                }}
                style={{
                  background: "none",
                  border: `1px solid ${t.line}`,
                  borderRadius: 6,
                  color: t.dim,
                  padding: "8px 14px",
                  fontSize: 13,
                }}
              >
                {s.oynatici.kal}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Video altı metadata: başlık + açıklama + üretici kartı. Player'a DOKUNMAZ —
          yalnız iframe'in ALTINA sibling UI; uretici state'i iframe render'ını etkilemez. */}
      <div style={{ padding: `24px ${t.pad} 0`, maxWidth: 760 }}>
        <div style={{ fontFamily: t.display, fontWeight: 800, fontSize: 24, lineHeight: 1.15 }}>
          {baslik.name}
          {baslik.kind === "dizi" && (
            <span style={{ color: t.dim, fontWeight: 400, fontSize: 15 }}>
              {"  "}
              {s.genel.seb(video.season ?? 1, video.episode ?? 1)}
            </span>
          )}
        </div>

        {/* Açıklama (üstte) → Üretici kartı (altında, SÜREKLİ AÇIK) */}
        <div style={{ marginTop: 14 }}>
          <Aciklama metin={baslik.description} />
        </div>
        <UreticiKarti uretici={uretici} />
      </div>

      {/* İzlenen videonun 1–10 halk oylaması (player'ın hemen altında) */}
      <PuanKontrol video={video} user={user} girisAc={girisAc} />

      {/* Topluluk: forum drawer'ı açar. Overlay olduğu için oynatıcı ETKİLENMEZ (video durmaz). */}
      {forumAc && (
        <div style={{ padding: `0 ${t.pad} 40px` }}>
          <button
            onClick={() => forumAc(baslik.id, video.id, baslik.name, video.name || s.genel.bolumNo(video.episode ?? 1))}
            style={{ background: "none", border: `1px solid ${t.accent}`, borderRadius: 999, color: t.accent, padding: "10px 20px", fontSize: 14, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}
          >
            💬 {baslik.kind === "dizi" ? s.forum.bolumBaslik : s.forum.baslik}
          </button>
        </div>
      )}
    </div>
  );
}

// ————— Video halk oylaması (1–10) — aggregate göster + optimistik oy —————
function PuanKontrol({ video, user, girisAc }) {
  const { s } = useLang();
  const [ozet, setOzet] = useState({ ortalama: null, oySayisi: 0, benim: null });

  useEffect(() => {
    getVideoPuan(video.id, user?.id ?? null).then(setOzet).catch(() => {});
  }, [video.id, user?.id]);

  function oyla(p) {
    if (!user) return girisAc(); // misafir → giriş (listemDegistir örüntüsü)
    // Optimistik: ortalama + oy sayısını yerelde güncelle (refetch beklemeden)
    setOzet((o) => {
      const yeniSayi = o.benim == null ? o.oySayisi + 1 : o.oySayisi;
      const toplam = (o.ortalama ?? 0) * o.oySayisi - (o.benim ?? 0) + p;
      const yeniOrt = yeniSayi > 0 ? Math.round((toplam / yeniSayi) * 10) / 10 : p;
      return { ortalama: yeniOrt, oySayisi: yeniSayi, benim: p };
    });
    puanVer(video.id, user.id, p).catch(() => {
      getVideoPuan(video.id, user.id).then(setOzet).catch(() => {}); // hata → tazele
    });
  }

  const p10 = s.kesfet.puanlama;
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: t.display, fontWeight: 700, fontSize: 16 }}>{p10.baslik}</span>
        {ozet.ortalama != null ? (
          <span style={{ fontSize: 15 }}>
            <b>{ozet.ortalama.toFixed(1)}</b>
            <span style={{ color: t.dim }}> · {p10.oy(ozet.oySayisi)}</span>
          </span>
        ) : (
          <span style={{ color: t.dim, fontSize: 14 }}>{p10.yok}</span>
        )}
        {ozet.benim != null && (
          <span style={{ color: t.dim, fontSize: 13, marginLeft: "auto" }}>
            {p10.senin}: {ozet.benim}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((p) => {
          const secili = ozet.benim === p;
          return (
            <button
              key={p}
              onClick={() => oyla(p)}
              title={!user ? p10.giris : undefined}
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: secili ? t.gradient : "none",
                color: secili ? "#0A0A0B" : t.text,
                border: `1px solid ${secili ? t.accent : t.line}`,
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {p}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ————— Ortak küçük parçalar —————
// Filtre çipi: seçiliyken vurgu dolgulu, değilken çerçeveli
function Cip({ etiket, secili, sec }) {
  return (
    <button
      onClick={sec}
      style={{
        background: secili ? t.gradient : "none",
        color: secili ? "#0A0A0B" : t.dim,
        border: secili ? "none" : `1px solid ${t.line}`,
        borderRadius: 999,
        padding: "7px 14px",
        fontSize: 13,
        fontWeight: secili ? 700 : 400,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {etiket}
    </button>
  );
}

function GeriButon({ geri }) {
  const { s } = useLang();
  return (
    <button
      onClick={geri}
      style={{ background: "none", border: "none", color: t.dim, fontSize: 14, padding: 0 }}
    >
      {s.genel.geri}
    </button>
  );
}

function Durum({ mesaj, geri }) {
  return (
    <div style={{ padding: `80px ${t.pad}`, textAlign: "center", color: t.dim, fontSize: 15 }}>
      {geri && (
        <div style={{ marginBottom: 16 }}>
          <GeriButon geri={geri} />
        </div>
      )}
      {mesaj}
    </div>
  );
}
