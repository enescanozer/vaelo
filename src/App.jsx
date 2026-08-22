// Kabuk: üst menü + sekme geçişi + dil anahtarı + bildirim zili + giriş/profil
// modalları + e-posta doğrulama şeridi
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useAuth, signOut } from "./auth";
import { supabase } from "./supabaseClient";
import { getNotifications, markNotificationsRead, getYarismaGorunur } from "./catalog";
import { useLang } from "./i18n";
import { t } from "./theme";
// Uzantı açık: Windows'ta "./Auth", auth.js ile çakışıyor
import Auth from "./Auth.jsx";
// Ana izleyici akışı hemen; üretici/admin ekranları AYRI CHUNK (lazy) — çoğu
// izleyici görmediği için ilk bundle'a girmezler.
import Viewer from "./Viewer";
import Contest from "./Contest";
import Tablo from "./Tablo";
import CreatorBasvuru from "./CreatorBasvuru";
const Upload = lazy(() => import("./Upload"));
const Studio = lazy(() => import("./Studio"));
const AdminPanel = lazy(() => import("./AdminPanel"));
const AnalyticsPanel = lazy(() => import("./AnalyticsPanel"));
import Profile from "./Profile";
import TakmaAdKur from "./TakmaAdKur";
import AyarlarModal from "./AyarlarModal";
import SifreYenile from "./SifreYenile.jsx";

const SEKMELER = [
  { id: "kesfet" },
  { id: "tablo" },
  { id: "yarisma" },
  { id: "uretici" },
  { id: "yukle", girisGerekli: true },
  { id: "studyo", girisGerekli: true },
  { id: "panel", modGerekli: true },
  { id: "analiz", adminGerekli: true },
];

export default function App() {
  const { user, profile, profilYenile } = useAuth();
  const { s } = useLang();
  const [sekme, setSekme] = useState(() => {
    // Deep-link: yalnız herkese-açık sekmeler URL'den başlatılır (korumalı sekmeler kesfet'e düşer;
    // oturum-içi geri/ileri state.sekme'den her sekmeyi geri yükler).
    const q = new URLSearchParams(window.location.search).get("sekme");
    return q && ["tablo", "yarisma", "uretici"].includes(q) ? q : "kesfet";
  });
  const [girisAcik, setGirisAcik] = useState(false);
  const [profilAcik, setProfilAcik] = useState(false);
  const [ayarlarAcik, setAyarlarAcik] = useState(false);
  const [sifreYenileAcik, setSifreYenileAcik] = useState(false);
  const [dogrulamaGonderildi, setDogrulamaGonderildi] = useState(false);
  const [bildirimler, setBildirimler] = useState([]);
  const [zilAcik, setZilAcik] = useState(false);
  // Yarışmadan "izle" denince Keşfet'te açılacak başlık ({id} sarmalı: aynı
  // başlık ikinci kez seçilse de etki tetiklensin diye her seferinde yeni nesne)
  const [istenenBaslik, setIstenenBaslik] = useState(null);
  // Logo/Keşfet tıklanınca Viewer'ı ana sayfaya döndüren sayaç sinyali
  const [anaSinyal, setAnaSinyal] = useState(0);
  // Üst menüde ada tıklayınca Viewer'da profil sayfasını açan sinyal
  const [profilId, setProfilId] = useState(null);
  const [profilSinyal, setProfilSinyal] = useState(0);
  const [yarismaGorunur, setYarismaGorunur] = useState(false);

  // ————— Tarayıcı geçmişi: TAB (sekme) navigasyonu —————
  // Viewer.jsx kesfet-içi (video/forum) history'i yönetir; burası TAB seviyesini ekler. ORTAK
  // history.state şeması: { sekme, id, forum }. App yalnız `sekme`'yi, Viewer `id/forum`'u yazar
  // (sekme kesfet iken). İki popstate dinleyicisi çakışmaz: App sekme'yi, Viewer id/forum'u okur.
  const sekmeRef = useRef(sekme);       // güncel sekme (popstate karşılaştırması, kapanış closure'ı)
  const popRefApp = useRef(false);      // popstate kaynaklı sekme değişimi → history'e tekrar yazma
  const ilkRefApp = useRef(true);       // ilk giriş: pushState değil replaceState

  const rol = profile?.role;
  const admin = rol === "admin";
  const moderator = rol === "admin" || rol === "moderator";
  const creator = rol === "creator" || rol === "admin";
  const cumaGunu = new Date().getUTCDay() === 5; // 5 = Cuma (UTC): eleme günü, Tablo normal kullanıcıya gizli

  // Sekme görünürlüğü: normal kullanıcı sade menü görür (film/dizi + koşullu Tablo/Yarışma).
  function sekmeGorunur(sk) {
    switch (sk.id) {
      case "tablo":
        return admin || moderator || !cumaGunu; // Cuma kesilir, Cts sergiyle başlar
      case "yarisma":
        return admin || moderator || yarismaGorunur; // aktif VEYA bitiş+2 hafta
      case "uretici":
        return !!user && rol === "viewer"; // yalnız onaysız izleyici başvurur
      case "yukle":
      case "studyo":
        return creator; // yalnız onaylı üretici (+admin)
      case "panel":
        return moderator;
      case "analiz":
        return admin;
      default:
        return true; // kesfet
    }
  }
  const gorunurSekmeler = SEKMELER.filter(sekmeGorunur);
  const okunmamis = bildirimler.filter((b) => !b.read_at).length;

  // Bildirimler yalnızca girişte yüklenir; taze liste zil AÇILINCA çekilir
  // (önceden her sekme geçişinde istek atılıyordu — gereksiz trafik)
  useEffect(() => {
    if (!user) {
      setBildirimler([]);
      return;
    }
    let aktif = true;
    getNotifications(user.id)
      .then((liste) => aktif && setBildirimler(liste))
      .catch(() => {});
    return () => {
      aktif = false;
    };
  }, [user?.id]);

  // Yarışma sekmesi penceresi (aktif VEYA bitiş+2 hafta) — bir kez yüklenir
  useEffect(() => {
    getYarismaGorunur().then(setYarismaGorunur).catch(() => {});
  }, []);

  // Sekme değişince history entry (ilk girişte replace + Viewer'ın yazdığı id/forum'u koru).
  useEffect(() => {
    sekmeRef.current = sekme;
    if (popRefApp.current) { popRefApp.current = false; return; } // popstate → URL zaten değişti
    if (ilkRefApp.current) {
      ilkRefApp.current = false;
      // İlk giriş: URL'i KORU (deep-link ?b= / ?sekme=), mevcut entry'ye sekme'yi işle.
      window.history.replaceState(
        { ...(window.history.state || {}), sekme },
        "",
        window.location.pathname + window.location.search
      );
      return;
    }
    // Tab değişti → YENİ entry. Video bağlamı temizlenir; kesfet'e dönüşte Viewer id'yi yeniden kurar.
    const url = sekme === "kesfet" ? window.location.pathname : `${window.location.pathname}?sekme=${sekme}`;
    window.history.pushState({ sekme, id: null, forum: null }, "", url);
  }, [sekme]);

  // Geri/İleri: history.state.sekme'den (yoksa ?sekme=) doğru sekmeyi geri yükle. Viewer'ın kesfet-içi
  // popstate dinleyicisiyle çakışmaz — bu yalnız sekme değişimini ele alır.
  useEffect(() => {
    const dinle = (e) => {
      const hedef = e.state?.sekme ?? new URLSearchParams(window.location.search).get("sekme") ?? "kesfet";
      if (hedef !== sekmeRef.current) {
        popRefApp.current = true;
        setSekme(hedef);
      }
    };
    window.addEventListener("popstate", dinle);
    return () => window.removeEventListener("popstate", dinle);
  }, []);

  // Şifre sıfırlama: e-postadaki bağlantı bu siteye recovery token'ıyla döner;
  // supabase-js token'ı URL'den yakalayıp PASSWORD_RECOVERY olayını tetikler →
  // "yeni şifre belirle" modalını aç.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((olay) => {
      if (olay === "PASSWORD_RECOVERY") setSifreYenileAcik(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function zilAcKapat() {
    const acilacak = !zilAcik;
    setZilAcik(acilacak);
    if (!acilacak || !user) return;
    const liste = await getNotifications(user.id).catch(() => null);
    if (liste) setBildirimler(liste);
    if ((liste ?? bildirimler).some((b) => !b.read_at)) {
      markNotificationsRead(user.id);
      setBildirimler((eski) =>
        eski.map((b) => ({ ...b, read_at: b.read_at ?? new Date().toISOString() }))
      );
    }
  }

  function sekmeSec(sk) {
    if (sk.girisGerekli && !user) {
      setGirisAcik(true);
      return;
    }
    setSekme(sk.id);
    // Keşfet'e tıklamak her zaman ana sayfaya döndürür (detay/oynatıcıdan çıkar)
    if (sk.id === "kesfet") setAnaSinyal((n) => n + 1);
  }

  async function dogrulamaGonder() {
    const { error } = await supabase.auth.resend({ type: "signup", email: user.email });
    if (!error) setDogrulamaGonderildi(true);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: t.bg,
        color: t.text,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Üst menü */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 24,
          padding: `0 ${t.pad}`,
          height: 64,
          background: "rgba(10,10,11,0.92)",
          backdropFilter: "blur(8px)",
          borderBottom: `1px solid ${t.line}`,
        }}
      >
        <div
          onClick={() => {
            setSekme("kesfet");
            setAnaSinyal((n) => n + 1);
          }}
          style={{ display: "flex", alignItems: "center", cursor: "pointer" }}
        >
          {/* Yatay lockup: gradient V ikon + "Vaelo" wordmark TEK görselde
              (ayrı metin yok — V harfi = ikon) */}
          <img
            src="/brand/vaelo_horizontal_lockup_transparent.png"
            alt="Vaelo"
            style={{ height: 34, width: "auto", display: "block" }}
          />
        </div>

        <nav style={{ display: "flex", gap: 24, flex: 1, overflowX: "auto" }}>
          {gorunurSekmeler.map((sk) => (
            <button
              key={sk.id}
              onClick={() => sekmeSec(sk)}
              style={{
                background: "none",
                border: "none",
                padding: "4px 0",
                fontSize: 15,
                whiteSpace: "nowrap",
                color: sekme === sk.id ? t.text : t.dim,
                fontWeight: sekme === sk.id ? 600 : 400,
                borderBottom:
                  sekme === sk.id ? `2px solid ${t.accent}` : "2px solid transparent",
              }}
            >
              {s.nav[sk.id]}
            </button>
          ))}
        </nav>

        {/* Ayarlar — dil + alt yazı tercihleri modalda */}
        <button
          onClick={() => setAyarlarAcik(true)}
          title={s.ayarlar.baslik}
          aria-label={s.ayarlar.baslik}
          style={{
            background: "none",
            border: `1px solid ${t.line}`,
            borderRadius: 6,
            color: t.dim,
            padding: "6px 9px",
            fontSize: 15,
            lineHeight: 1,
          }}
        >
          ⚙
        </button>

        {user ? (
          <div style={{ display: "flex", alignItems: "center", gap: 16, position: "relative" }}>
            {/* Bildirim zili */}
            <button
              onClick={zilAcKapat}
              title={s.kabuk.bildirimler}
              aria-label={s.kabuk.bildirimler}
              style={{
                background: "none",
                border: "none",
                color: t.dim,
                fontSize: 16,
                padding: 0,
                position: "relative",
              }}
            >
              🔔
              {okunmamis > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -4,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: t.gradient,
                  }}
                />
              )}
            </button>
            {zilAcik && (
              <>
                {/* Dışarı tıklayınca zili kapat */}
                <div
                  onClick={() => setZilAcik(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 15 }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: 44,
                    right: 0,
                    width: 320,
                    maxHeight: 380,
                    overflowY: "auto",
                    background: t.surface,
                    border: `1px solid ${t.line}`,
                    borderRadius: 10,
                    padding: 8,
                    zIndex: 20,
                  }}
                >
                  {bildirimler.length === 0 && (
                    <div style={{ color: t.dim, fontSize: 13, padding: 12, textAlign: "center" }}>
                      {s.kabuk.bildirimYok}
                    </div>
                  )}
                  {bildirimler.map((b) => {
                    // Tablo (art) bildirimleri: metin türe göre, tıklayınca Tablo sekmesi
                    const art = b.kind === "art_eleme" || b.kind === "art_sergi";
                    const tabloyaGit = () => {
                      setSekme("tablo");
                      setZilAcik(false);
                    };
                    return (
                      <div
                        key={b.id}
                        onClick={art ? tabloyaGit : undefined}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 8,
                          fontSize: 13,
                          lineHeight: 1.4,
                          cursor: art ? "pointer" : "default",
                        }}
                      >
                        {art ? (
                          <span style={{ fontWeight: 600 }}>
                            {b.kind === "art_eleme" ? s.art.bildirimEleme : s.art.bildirimSergi}
                          </span>
                        ) : (
                          <>
                            <span style={{ fontWeight: 600 }}>
                              {b.titles?.name ?? s.kabuk.yeniIcerik}
                            </span>
                            {b.videos?.season != null && (
                              <span style={{ color: t.dim }}>
                                {" "}
                                {s.genel.seb(b.videos.season, b.videos.episode)}
                                {b.videos.name ? ` — ${b.videos.name}` : ""}
                              </span>
                            )}
                            <span style={{ color: t.dim }}> {s.kabuk.yayinda}</span>
                          </>
                        )}
                        <div style={{ color: t.dim, fontSize: 11, marginTop: 2 }}>
                          {new Date(b.created_at).toLocaleString(s.locale)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {/* Ada tıklayınca profil SAYFASI açılır (Keşfet içinde, kendi profili) */}
            <button
              onClick={() => { setProfilId(user.id); setProfilSinyal((n) => n + 1); setSekme("kesfet"); }}
              style={{
                background: "none",
                border: "none",
                color: t.dim,
                fontSize: 13,
                padding: 0,
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              {profile?.display_name || user.email}
            </button>
            <button
              onClick={() => {
                signOut();
                setSekme("kesfet");
              }}
              style={{
                background: "none",
                border: `1px solid ${t.line}`,
                borderRadius: 8,
                color: t.dim,
                padding: "7px 14px",
                fontSize: 13,
              }}
            >
              {s.genel.cikis}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setGirisAcik(true)}
            style={{
              background: "none",
              border: `1px solid ${t.line}`,
              borderRadius: 8,
              color: t.text,
              padding: "8px 16px",
              fontSize: 14,
              whiteSpace: "nowrap",
            }}
          >
            {s.genel.girisYap}
          </button>
        )}
      </header>

      {/* E-posta doğrulama şeridi */}
      {user && !user.email_confirmed_at && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: `10px ${t.pad}`,
            background: t.surface,
            borderBottom: `1px solid ${t.line}`,
            fontSize: 13,
            color: t.dim,
          }}
        >
          {s.kabuk.dogrulanmadi}
          {dogrulamaGonderildi ? (
            <span>{s.kabuk.gonderildi}</span>
          ) : (
            <button
              onClick={dogrulamaGonder}
              style={{
                background: "none",
                border: `1px solid ${t.line}`,
                borderRadius: 6,
                color: t.text,
                padding: "4px 10px",
                fontSize: 12,
              }}
            >
              {s.kabuk.yenidenGonder}
            </button>
          )}
        </div>
      )}

      {/* Aktif sekme */}
      <main style={{ flex: 1 }}>
        {sekme === "kesfet" && (
          <Viewer
            user={user}
            istenen={istenenBaslik}
            anaSinyal={anaSinyal}
            profilId={profilId}
            profilSinyal={profilSinyal}
            girisAc={() => setGirisAcik(true)}
            festivalGit={(hedef) => {
              // Festival CTA'ları: sanat → Tablo; film → rol-farkında (creator=Yükle,
              // girişli izleyici=Üretici ol, anon=giriş).
              if (hedef === "art") return setSekme("tablo");
              if (!user) return setGirisAcik(true);
              setSekme(creator ? "yukle" : "uretici");
            }}
          />
        )}
        {sekme === "tablo" && (
          <Tablo
            user={user}
            admin={admin}
            moderator={moderator}
            girisAc={() => setGirisAcik(true)}
          />
        )}
        {sekme === "yarisma" && (
          <Contest
            user={user}
            izle={(id) => {
              setIstenenBaslik({ id });
              setSekme("kesfet");
            }}
            girisAc={() => setGirisAcik(true)}
          />
        )}
        {sekme === "uretici" && (
          <CreatorBasvuru user={user} girisAc={() => setGirisAcik(true)} />
        )}
        {/* Lazy ekranlar: chunk yüklenene dek sade bir yükleniyor durumu */}
        <Suspense
          fallback={
            <div style={{ padding: `80px ${t.pad}`, textAlign: "center", color: t.dim, fontSize: 15 }}>
              {s.genel.yukleniyor}
            </div>
          }
        >
          {sekme === "yukle" && creator && <Upload user={user} admin={admin} />}
          {sekme === "studyo" && creator && <Studio user={user} />}
          {sekme === "panel" && moderator && <AdminPanel admin={admin} />}
          {sekme === "analiz" && admin && <AnalyticsPanel />}
        </Suspense>
      </main>

      {/* Alt bilgi: platform kimliği + AI beyanı */}
      <footer
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          justifyContent: "space-between",
          padding: `24px ${t.pad}`,
          borderTop: `1px solid ${t.line}`,
          color: t.dim,
          fontSize: 12,
        }}
      >
        <span>
          <span style={{ fontFamily: t.display, fontWeight: 800, letterSpacing: 1 }}>
            VAELO
          </span>
          {" — "}
          {s.kabuk.altBilgi1}
        </span>
        <span>{s.kabuk.altBilgi2}</span>
      </footer>

      {girisAcik && <Auth kapat={() => setGirisAcik(false)} />}
      {profilAcik && user && (
        <Profile
          user={user}
          profile={profile}
          kapat={() => setProfilAcik(false)}
          yenile={profilYenile}
        />
      )}
      {/* İlk-kurulum: takma ad seçilmemişse zorunlu modal (kapatılamaz) */}
      {user && profile && !profile.display_name_chosen && (
        <TakmaAdKur profile={profile} yenile={profilYenile} />
      )}
      {ayarlarAcik && <AyarlarModal kapat={() => setAyarlarAcik(false)} />}
      {sifreYenileAcik && (
        <SifreYenile
          kapat={() => {
            setSifreYenileAcik(false);
            // Recovery token'ı URL'den temizle (yenilemede tekrar tetiklenmesin)
            if (window.location.hash) {
              window.history.replaceState(null, "", window.location.pathname + window.location.search);
            }
          }}
        />
      )}
    </div>
  );
}
