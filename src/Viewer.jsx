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
  getUreticiIcerikleri,
  turAdi,
  sosyalUrl,
  sohbetSayim,
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
  // Mount kaynağı: (1) history.state.id — tab-geri ile kesfet'e dönüşte videoyu geri yükler;
  // (2) ilk açılışta ?b= deep-link. İkisi de yoksa ana sayfa.
  const [gorunum, setGorunum] = useState(() => {
    const st = window.history.state;
    const id =
      (st && st.id) ||
      (!derinBaglantiKullanildi ? new URLSearchParams(window.location.search).get("b") : null);
    return id ? { tip: "detay", id } : { tip: "ana" };
  });
  useEffect(() => {
    derinBaglantiKullanildi = true;
  }, []);

  // Forum: mevcut görünümün ÜSTÜNE overlay (drawer/bottom-sheet) olarak açılır. Böylece
  // oynatıcı yeniden mount edilmez, video durmaz (tam-sayfa forum yaklaşımı kaldırıldı).
  // Forum overlay — history.state.forum'dan başlatılır (tab-geri/ileri ile drawer geri yüklenir).
  const [forum, setForum] = useState(() => (window.history.state && window.history.state.forum) || null);
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

  // ————— Tarayıcı geçmişi (browser back/forward) —————
  // Kök sorun (eski): navigasyonda YALNIZ replaceState kullanılıyordu (pushState YOK) + popstate
  // dinleyici YOK → tarayıcı geri tuşu uygulama içi görünümler arasında gezmiyordu (uygulamayı
  // bırakıyordu). Çözüm: anlamlı görünüm değişiminde pushState (aynı id = aynı sayfa → replace) +
  // popstate ile state'i geri yükle. ?b= deep-link davranışı korunur (aynı URL şeması).
  const popRef = useRef(false);       // popstate kaynaklı değişim → history'e tekrar yazma (döngü önle)
  const ilkRef = useRef(true);        // ilk giriş: pushState değil replaceState (fantom entry olmasın)
  const mevcutIdRef = useRef(null);   // aktif mantıksal sayfa id'si (aynı videoda forum aç/kapa → player RESET olmasın)

  // gorunum + forum → history.state ({id, forum}) + url (?b=id). detay↔oynat aynı id = aynı sayfa.
  useEffect(() => {
    // Üretici profili URL'de ?b= üretmez (b= başlık deep-link'i içindir) → ana gibi id=null.
    const id = gorunum.tip === "oynat" ? gorunum.baslik.id : gorunum.tip === "detay" ? gorunum.id : null;
    mevcutIdRef.current = id;
    if (popRef.current) { popRef.current = false; return; } // popstate → URL zaten değişti, dokunma
    const url = id ? `?b=${id}` : window.location.pathname;
    const durum = { sekme: "kesfet", id, forum: forum || null }; // sekme: App'in popstate'i için
    if (ilkRef.current) {
      ilkRef.current = false;
      window.history.replaceState(durum, "", url); // ilk giriş: mevcut entry'yi damgala
      return;
    }
    const onceki = window.history.state || {};
    const yeniSayfa = id !== (onceki.id ?? null);       // farklı video / ana ↔ detay → yeni entry
    const forumAcildi = !!durum.forum && !onceki.forum; // forum kapalı→açık → yeni entry (geri ile kapansın)
    if (yeniSayfa || forumAcildi) window.history.pushState(durum, "", url);
    else window.history.replaceState(durum, "", url);
  }, [gorunum, forum]);

  // Geri/İleri (popstate): history.state'ten görünümü + forum overlay'ini geri yükle.
  useEffect(() => {
    const dinle = (e) => {
      const st = e.state || {};
      // Tab-seviyesi hedef (kesfet dışı) → App'in popstate handler'ı ele alır; Viewer karışmaz.
      if (st.sekme && st.sekme !== "kesfet") return;
      const hedefId = st.id ?? new URLSearchParams(window.location.search).get("b") ?? null;
      popRef.current = true;
      // Yalnız sayfa GERÇEKTEN değiştiyse görünümü değiştir → aynı videoda forum toggling player'ı RESETLEMEZ
      if (hedefId !== mevcutIdRef.current) {
        setGorunum(hedefId ? { tip: "detay", id: hedefId } : { tip: "ana" });
      }
      setForum(st.forum || null);
    };
    window.addEventListener("popstate", dinle);
    return () => window.removeEventListener("popstate", dinle);
  }, []);

  const oynat = (video, baslik, baslangic = 0) =>
    setGorunum({ tip: "oynat", video, baslik, baslangic });
  // Üretici profil sayfası (Instagram/TikTok tarzı: bio + ürettiği içerikler)
  const ureticiAc = (creatorId) => creatorId && setGorunum({ tip: "uretici", id: creatorId });

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
        ureticiAc={ureticiAc}
        geri={() => setGorunum({ tip: "ana" })}
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
  } else if (gorunum.tip === "uretici") {
    ekran = (
      <UreticiProfili
        id={gorunum.id}
        ac={(id) => setGorunum({ tip: "detay", id })}
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
          kapat={() => {
            // Forum açılışında bir history entry push edildi → geri alarak kapat (popstate forum'u
            // temizler); böylece tarayıcı geri tuşu ile ESC/✕/backdrop AYNI davranır. Entry yoksa düz kapat.
            if (window.history.state?.forum) window.history.back();
            else setForum(null);
          }}
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
        {[turAdi(kart.tip, s), kart.tur]
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
        // Issue 1: hero banner + ikinci tık KALDIRILDI — başlık yüklenince DOĞRUDAN oynatıcı.
        const ilk = b?.videos?.[0];
        if (ilk) oynat(ilk, b); // → { tip: "oynat" } (Viewer view state)
        else setHata("no-playable");
      })
      .catch((e) => aktif && setHata(e.message));
    return () => {
      aktif = false;
    };
  }, [id]);

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
  // Detay artık YÜKLEYİCİ: efekt oynat()'ı çağırana (ya da video yoksa hata) kadar yalnız spinner.
  // Eski hero render'ı (aşağıda) artık ULAŞILMAZ — minify DCE ile bundle'dan düşer; Image 4
  // düzeni Oynatici'de. (Issue 1 + Issue 2)
  return <Durum mesaj={s.genel.yukleniyor} geri={geri} />;

  // eslint-disable-next-line no-unreachable
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

// ————— Üretici profil sayfası (Instagram/TikTok tarzı): avatar + ad + bio + sosyal + ürettiği içerikler —————
// Kaynak: public uretici_kartlari + yayınlanmış içerikler (RLS). Kendi profil düzenleme sistemine DOKUNMAZ.
function UreticiProfili({ id, ac, geri }) {
  const { s } = useLang();
  const [uretici, setUretici] = useState(null);
  const [icerikler, setIcerikler] = useState(null); // null: yükleniyor
  useEffect(() => {
    let aktif = true;
    setUretici(null);
    setIcerikler(null);
    getUreticiProfil(id).then((u) => aktif && setUretici(u)).catch(() => {});
    getUreticiIcerikleri(id).then((v) => aktif && setIcerikler(v)).catch(() => aktif && setIcerikler([]));
    return () => { aktif = false; };
  }, [id]);

  const linkler = uretici
    ? [
        ["instagram", "Instagram", uretici.instagram],
        ["tiktok", "TikTok", uretici.tiktok],
        ["youtube", "YouTube", uretici.youtube],
        ["twitter", "X", uretici.twitter],
        ["website", s.kesfet.website, uretici.website],
      ].filter(([p, , ham]) => sosyalUrl(p, ham))
    : [];

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: `16px ${t.pad} 64px` }}>
      <div style={{ marginBottom: 14 }}>
        <GeriButon geri={geri} />
      </div>

      {/* Başlık: gradient halkalı avatar + ad + içerik sayacı */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <div style={{ padding: 3, borderRadius: "50%", background: t.gradient, flexShrink: 0, boxShadow: "0 8px 28px rgba(0,0,0,0.35)" }}>
          <div style={{ padding: 3, borderRadius: "50%", background: t.bg }}>
            <Avatar ad={uretici?.display_name || "?"} boyut={96} />
          </div>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: t.accent, fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase" }}>
            {s.kesfet.uretici}
          </div>
          <div style={{ fontFamily: t.display, fontWeight: 800, fontSize: "clamp(24px, 4.5vw, 36px)", lineHeight: 1.08, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis" }}>
            {uretici?.display_name || s.kesfet.uretici}
          </div>
          {icerikler !== null && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, padding: "5px 13px", borderRadius: 999, background: t.surface2, border: `1px solid ${t.line}`, fontSize: 13, color: t.dim }}>
              <span style={{ color: t.text, fontWeight: 800 }}>{icerikler.length}</span> 🎬
            </div>
          )}
        </div>
      </div>

      {uretici?.bio && (
        <div style={{ color: t.text, opacity: 0.82, fontSize: 15, lineHeight: 1.6, marginTop: 18, whiteSpace: "pre-wrap", maxWidth: 620 }}>
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
              style={{ fontSize: 13, fontWeight: 600, color: t.text, textDecoration: "none", padding: "8px 15px", border: `1px solid ${t.line}`, borderRadius: 999, background: t.surface2, transition: "border-color .15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = t.accent)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = t.line)}
            >
              {etiket} ↗
            </a>
          ))}
        </div>
      )}

      {/* Ürettiği içerikler */}
      <div style={{ borderTop: `1px solid ${t.line}`, marginTop: 28, paddingTop: 24 }}>
        {icerikler === null ? (
          <div style={{ color: t.dim }}>{s.genel.yukleniyor}</div>
        ) : icerikler.length === 0 ? (
          <div style={{ color: t.dim }}>—</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {icerikler.map((b) => (
              <Kart key={b.id} kart={toCard(b)} ac={ac} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ————— Oynatıcı: sponsor pre-roll → CF iframe + SDK ile gerçek izlenme süresi —————
function Oynatici({ video, baslik, baslangic = 0, user, oynat, geri, girisAc, forumAc, ureticiAc }) {
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

  // Üretici satırı aksiyonları (Image 4): Listem (kalp) + Paylaş + ⋯ menü
  const [ekli, setEkli] = useState(null); // null: bilinmiyor
  const [kopyalandi, setKopyalandi] = useState(false);
  const [menuAcik, setMenuAcik] = useState(false);
  const [aciklamaAcik, setAciklamaAcik] = useState(false); // mobil: uzun açıklama aç/kapa
  const gen = usePencereGen();
  const dar = gen < 480; // mobil kırılım: üretici satırı 2 sıra, puan 5x2 grid, açıklama collapse vb.
  useEffect(() => {
    let aktif = true;
    setEkli(null);
    if (user) inMyList(user.id, baslik.id).then((e) => aktif && setEkli(e));
    return () => { aktif = false; };
  }, [user?.id, baslik.id]);

  // Topluluk mesaj sayısı (canlı, sohbet_mesajlari'ndan; bölüm odası ep:<video_id>)
  const [sohbetSayi, setSohbetSayi] = useState(null);
  useEffect(() => {
    let aktif = true;
    setSohbetSayi(null);
    sohbetSayim(`ep:${video.id}`).then((n) => aktif && setSohbetSayi(n)).catch(() => aktif && setSohbetSayi(0));
    return () => { aktif = false; };
  }, [video.id]);

  // Sekme başlığını içerikle eşle (paylaşılan sekmelerde ad görünsün) — eski Detay'dan taşındı
  useEffect(() => {
    document.title = `${baslik.name} — Vaelo`;
    return () => { document.title = s.belgeBasligi; };
  }, [baslik.name, s]);

  async function listemDegistir() {
    if (!user) return girisAc();
    if (ekli === null) return;
    setEkli(!ekli); // iyimser
    await toggleMyList(user.id, baslik.id, ekli);
  }
  async function paylas() {
    const url = `${window.location.origin}${window.location.pathname}?b=${baslik.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 2000);
    } catch {
      /* pano erişimi reddedilirse sessizce geç */
    }
  }

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
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: `16px ${t.pad} 64px` }}>
      <div style={{ marginBottom: 14 }}>
        <GeriButon geri={geri} />
      </div>

      {/* PLAYER (Image 4: sayfanın en üstü, tam genişlik, 16:9). iframe/SDK mantığı DEĞİŞMEDİ. */}
      <div
        style={{
          position: "relative",
          paddingTop: "56.25%",
          background: "#000",
          borderRadius: 12,
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

      {/* Image 4 düzeni (desktop) + MOBİL-ÖZEL geçiş (dar<480): daha küçük başlık, 2-sıra üretici
          satırı, 5x2 puan grid'i, açıklama collapse, tam-genişlik yığın ve mobil dikey ritim. */}
      <div style={{ marginTop: dar ? 18 : 24 }}>
        {/* Başlık — mobilde daha küçük, en fazla 2 satır (uzun başlıklar temiz kırpılır) */}
        <div
          style={{
            fontFamily: t.display,
            fontWeight: 800,
            fontSize: dar ? 21 : "clamp(24px, 4vw, 34px)",
            lineHeight: dar ? 1.2 : 1.12,
            ...(dar ? { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } : {}),
          }}
        >
          {baslik.name}
          {baslik.kind === "dizi" && (
            <span style={{ color: t.dim, fontWeight: 400, fontSize: dar ? 14 : 16 }}>
              {"  "}
              {s.genel.seb(video.season ?? 1, video.episode ?? 1)}
            </span>
          )}
        </div>

        {baslik.kurucu_icerigi && (
          <div style={{ marginTop: 12 }}>
            <span style={{ display: "inline-block", padding: "5px 12px", borderRadius: 999, background: t.gradient, color: "#0A0A0B", fontSize: 12, fontWeight: 800, letterSpacing: 0.3 }}>
              {s.kesfet.kurucuEkip}
            </span>
          </div>
        )}

        {/* Üretici satırı — mobilde 2 SIRA (bilgi üstte, aksiyonlar altta sağa hizalı); desktop tek sıra */}
        <div style={{ display: "flex", flexDirection: dar ? "column" : "row", alignItems: dar ? "stretch" : "center", justifyContent: "space-between", gap: dar ? 12 : 16, marginTop: dar ? 16 : 18 }}>
          {/* Üreticiye tıkla → üretici profil sayfası (bio + ürettiği içerikler) */}
          <button
            type="button"
            onClick={() => baslik.creator_id && ureticiAc?.(baslik.creator_id)}
            disabled={!baslik.creator_id}
            title={uretici?.display_name || s.kesfet.uretici}
            style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, background: "none", border: "none", padding: 0, textAlign: "left", cursor: baslik.creator_id ? "pointer" : "default", color: "inherit" }}
          >
            <Avatar ad={uretici?.display_name || baslik.name} boyut={dar ? 40 : 44} />
            <div style={{ fontWeight: 700, fontSize: 15, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {uretici?.display_name || s.kesfet.uretici}
            </div>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, justifyContent: dar ? "flex-end" : "flex-start" }}>
            <button
              onClick={listemDegistir}
              aria-label={s.kesfet.listemeEkle}
              title={ekli ? s.kesfet.listemde : s.kesfet.listemeEkle}
              style={{ ...yuvarlakBtn, color: ekli ? t.accent : t.text, borderColor: ekli ? t.accent : t.line }}
            >
              {ekli ? "♥" : "♡"}
            </button>
            <button
              onClick={paylas}
              title={s.kesfet.paylas}
              style={{ ...yuvarlakBtn, width: dar ? 44 : "auto", padding: dar ? 0 : "0 16px", gap: 8 }}
            >
              <span style={{ fontSize: 15 }}>↗</span>
              {!dar && <span style={{ fontSize: 14, whiteSpace: "nowrap" }}>{kopyalandi ? s.kesfet.kopyalandi : s.kesfet.paylas}</span>}
            </button>
            <div style={{ position: "relative" }}>
              <button onClick={() => setMenuAcik((v) => !v)} aria-label="⋯" style={yuvarlakBtn}>⋯</button>
              {menuAcik && (
                <div onMouseLeave={() => setMenuAcik(false)} style={{ position: "absolute", right: 0, top: 50, background: t.surface2, border: `1px solid ${t.line}`, borderRadius: 10, minWidth: 180, zIndex: 5, overflow: "hidden", display: "grid" }}>
                  <button style={menuOge2} onClick={() => { setMenuAcik(false); paylas(); }}>{s.kesfet.paylas}</button>
                  {[["instagram", "Instagram"], ["tiktok", "TikTok"], ["youtube", "YouTube"], ["twitter", "X"], ["website", s.kesfet.website]].map(([p, et]) => {
                    const url = uretici && sosyalUrl(p, uretici[p]);
                    if (!url) return null;
                    return (
                      <a key={p} href={url} target="_blank" rel="noopener noreferrer" style={{ ...menuOge2, textDecoration: "none" }}>
                        {et} ↗
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <hr style={{ border: "none", borderTop: `1px solid ${t.line}`, margin: dar ? "16px 0" : "20px 0" }} />

        {/* İki sütun (desktop) / dikey tam-genişlik yığın (mobil). Mobilde gap daha sıkı. */}
        <div style={{ display: "flex", gap: dar ? 26 : 40, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: dar ? "1 1 100%" : "1 1 340px", minWidth: 0 }}>
            <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 18, marginBottom: 12 }}>{s.oynatici.aciklama}</div>
            {baslik.description ? (
              (() => {
                // Mobilde uzun açıklama 6 satıra kırpılır + "Daha fazla/az" (rating'i aşağı itmesin)
                const uzun = dar && baslik.description.length > 200;
                const kapali = uzun && !aciklamaAcik;
                return (
                  <>
                    <div
                      style={{
                        color: t.dim,
                        fontSize: 15,
                        lineHeight: 1.75,
                        whiteSpace: "pre-wrap",
                        ...(kapali ? { display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical", overflow: "hidden" } : {}),
                      }}
                    >
                      {baslik.description}
                    </div>
                    {uzun && (
                      <button onClick={() => setAciklamaAcik((v) => !v)} style={{ background: "none", border: "none", color: t.text, fontSize: 13, fontWeight: 600, padding: "8px 0 0", cursor: "pointer" }}>
                        {aciklamaAcik ? s.kesfet.dahaAz : s.kesfet.dahaFazla}
                      </button>
                    )}
                  </>
                );
              })()
            ) : (
              <div style={{ color: t.dim, fontSize: 14 }}>—</div>
            )}
            <MetaSatir video={video} baslik={baslik} />
          </div>
          <div style={{ flex: dar ? "1 1 100%" : "1 1 260px", minWidth: 0, maxWidth: dar ? "none" : 360, width: dar ? "100%" : "auto" }}>
            <PuanKontrol video={video} user={user} girisAc={girisAc}>
              {forumAc && (
                <button
                  onClick={() => forumAc(baslik.id, video.id, baslik.name, video.name || s.genel.bolumNo(video.episode ?? 1))}
                  style={{ width: "100%", background: "none", border: `1px solid ${t.accent}`, borderRadius: 999, color: t.accent, padding: dar ? "14px 20px" : "12px 20px", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}
                >
                  💬 {baslik.kind === "dizi" ? s.forum.bolumBaslik : s.forum.baslik}
                  {sohbetSayi != null ? ` (${sohbetSayi})` : ""}
                </button>
              )}
            </PuanKontrol>
          </div>
        </div>

        {/* Dizi bölüm listesi (aktif bölüm vurgulu) */}
        {baslik.kind === "dizi" && baslik.videos.length > 1 && (
          <div style={{ marginTop: 36, display: "grid", gap: 10 }}>
            {baslik.videos.map((v) => (
              <div
                key={v.id}
                onClick={() => oynat(v, baslik)}
                style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", background: v.id === video.id ? t.surface2 : t.surface, border: `1px solid ${v.id === video.id ? t.accent : t.line}`, borderRadius: 10, cursor: "pointer" }}
              >
                <span style={{ color: t.dim, fontSize: 13, width: 56, flexShrink: 0 }}>{s.genel.seb(v.season ?? 1, v.episode ?? 1)}</span>
                <span style={{ fontSize: 15, fontWeight: 600, flex: 1, minWidth: 0 }}>{v.name || s.genel.bolumNo(v.episode ?? 1)}</span>
                <button onClick={(e) => { e.stopPropagation(); forumAc(baslik.id, v.id, baslik.name, v.name || s.genel.bolumNo(v.episode ?? 1)); }} title={s.forum.bolumBaslik} style={{ background: "none", border: "none", color: t.dim, fontSize: 15, cursor: "pointer", padding: "0 4px" }}>💬</button>
                <span style={{ color: t.dim, fontSize: 13 }}>▶</span>
              </div>
            ))}
          </div>
        )}

        {/* Yapım Süreci (BTS) */}
        {baslik.yapimlar?.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 18, marginBottom: 12 }}>{s.kesfet.yapimSureci}</div>
            <div style={{ display: "grid", gap: 10 }}>
              {baslik.yapimlar.map((v) => (
                <div key={v.id} onClick={() => oynat(v, baslik)} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", background: t.surface, border: `1px solid ${t.line}`, borderRadius: 8, cursor: "pointer" }}>
                  <span style={{ fontSize: 15, width: 56, flexShrink: 0, textAlign: "center" }}>🎬</span>
                  <span style={{ fontSize: 15, fontWeight: 600, flex: 1, minWidth: 0 }}>{v.name || s.kesfet.yapimSureci}</span>
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

// Pencere genişliği (mobil kırılım için) — resize'e duyarlı.
function usePencereGen() {
  const [g, setG] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1280));
  useEffect(() => {
    const f = () => setG(window.innerWidth);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return g;
}

// Metadata satırı (Image 4): süre · tarih · #tür — sol hizalı, sönük.
function MetaSatir({ video, baslik }) {
  const { s } = useLang();
  const sn = Math.max(0, Math.round(Number(video.duration_seconds) || 0));
  const tarih = video.published_at || video.created_at;
  const ogeler = [];
  if (sn > 0) ogeler.push(<span key="sure">🕐 {s.oynatici.sure(Math.floor(sn / 60), sn % 60)}</span>);
  if (tarih) ogeler.push(<span key="tarih">📅 {new Date(tarih).toLocaleDateString(s.locale, { day: "numeric", month: "short", year: "numeric" })}</span>);
  if (baslik.genre) ogeler.push(<span key="tur" style={{ padding: "3px 10px", borderRadius: 999, background: t.surface2, border: `1px solid ${t.line}`, color: t.text }}>#{baslik.genre}</span>);
  if (ogeler.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", color: t.dim, fontSize: 13, marginTop: 20 }}>
      {ogeler.map((o, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {i > 0 && <span style={{ opacity: 0.5 }}>·</span>}
          {o}
        </span>
      ))}
    </div>
  );
}

const yuvarlakBtn = { height: 44, minWidth: 44, background: "none", border: `1px solid ${t.line}`, borderRadius: 999, color: t.text, fontSize: 16, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" };
const menuOge2 = { background: "none", border: "none", color: t.text, textAlign: "left", padding: "10px 14px", fontSize: 13, cursor: "pointer", width: "100%" };

// ————— Video halk oylaması (1–10) — aggregate göster + optimistik oy —————
function PuanKontrol({ video, user, girisAc, children }) {
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
  const dar = usePencereGen() < 480; // mobil: 1-10 butonları 5x2 grid (taşma/küçük-hedef yerine)
  return (
    <div>
      {/* Puan ver  <ortalama> / 10  (Image 4: ortalama accent + büyük) */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontFamily: t.display, fontWeight: 700, fontSize: 18 }}>{p10.baslik}</span>
        <span style={{ fontSize: 15 }}>
          <b style={{ color: t.accent, fontSize: 21 }}>{ozet.ortalama != null ? ozet.ortalama.toFixed(1) : "—"}</b>
          <span style={{ color: t.dim }}> / 10</span>
        </span>
      </div>
      {/* Mobil: 5x2 grid (dokunma-dostu 48px); desktop: tek sıra 38px (değişmedi) */}
      <div
        style={{
          display: dar ? "grid" : "flex",
          ...(dar ? { gridTemplateColumns: "repeat(5, 1fr)" } : { flexWrap: "wrap" }),
          gap: dar ? 8 : 6,
          marginBottom: children ? (dar ? 20 : 18) : 0,
        }}
      >
        {Array.from({ length: 10 }, (_, i) => i + 1).map((p) => {
          const secili = ozet.benim === p;
          return (
            <button
              key={p}
              onClick={() => oyla(p)}
              title={!user ? p10.giris : undefined}
              style={{
                width: dar ? "100%" : 38,
                height: dar ? 48 : 38,
                borderRadius: dar ? 10 : 8,
                background: secili ? t.gradient : dar ? t.surface : "none",
                color: secili ? "#0A0A0B" : t.text,
                border: `1px solid ${secili ? t.accent : t.line}`,
                fontSize: dar ? 16 : 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {p}
            </button>
          );
        })}
      </div>
      {children}
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
