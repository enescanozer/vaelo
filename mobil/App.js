// Vaelo mobil (Expo) — ince izleyici istemcisi: web ile AYNI Supabase backend'i.
// Düzen: Keşfet = hero + AÇIKLAMALI dikey akış (YouTube/Netflix mobil hissi);
// oynatıcı = video üstte sabit, altında kaydırılabilir bilgi + bölüm listesi;
// arama = yazarken anında, ada göre akıllı sıralı, kapak+açıklamalı zengin satırlar.
// Dil: varsayılan İngilizce, başlıktaki anahtar döngüsel (sözlük: mobil/i18n.js).
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { WebView } from "react-native-webview";
import * as ImagePicker from "expo-image-picker";
import {
  getCatalog,
  getTitle,
  searchTitles,
  logWatch,
  getMyList,
  getContinueWatching,
  inMyList,
  toggleMyList,
  thumbUrl,
  iframeUrl,
  getBuHafta,
  getSergi,
  getOySeti,
  artOyVer,
  getBenimEserim,
  eserGonder,
  artBildir,
  kayitPushToken,
} from "./api";
import { useAuth, signIn, signUp, signOut } from "./auth";
import { METINLER } from "./i18n";

// Tasarım token'ları — web'deki theme.js ile aynı değerler
const t = {
  bg: "#0A0A0B",
  surface: "#121214",
  surface2: "#15151A",
  line: "#222226",
  text: "#ECEEE9",
  dim: "#8C8F88",
  accent: "#CDFF4A",
  danger: "#E2574C",
};

const AYAR_ANAHTAR = "latent_mobil_ayarlar";

// Kullanıcı-girdisi URL güvenliği: yalnız http/https (javascript:/data: engellenir).
// Şema yoksa https:// varsay. Güvenli değilse null.
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

export default function App() {
  // gorunum: {tip:"ana"} | {tip:"detay", id} | {tip:"oynat", video, baslik}
  const [gorunum, setGorunum] = useState({ tip: "ana" });
  const [dil, setDil] = useState("en");
  const [ayarlar, setAyarlar] = useState({ altyaziAcik: false, altyaziDil: "" });
  const [girisAcik, setGirisAcik] = useState(false);
  const [ayarlarAcik, setAyarlarAcik] = useState(false);
  const { user } = useAuth();
  const d = METINLER[dil];

  // Ayarları (dil + alt yazı) cihazda kalıcı tut. yuklendi bayrağı olmadan ilk
  // render'daki kaydetme, AsyncStorage okumasından önce bitip kaydı default'la
  // ezebilirdi (yarış koşulu) — bu yüzden yükleme tamamlanana dek yazmıyoruz.
  const [ayarYuklendi, setAyarYuklendi] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(AYAR_ANAHTAR)
      .then((ham) => {
        if (!ham) return;
        const kayit = JSON.parse(ham);
        if (kayit.dil && METINLER[kayit.dil]) setDil(kayit.dil);
        if (kayit.ayarlar) setAyarlar((e) => ({ ...e, ...kayit.ayarlar }));
      })
      .catch(() => {
        /* yok ya da bozuk kayıt → varsayılan */
      })
      .finally(() => setAyarYuklendi(true));
  }, []);
  useEffect(() => {
    if (!ayarYuklendi) return;
    AsyncStorage.setItem(AYAR_ANAHTAR, JSON.stringify({ dil, ayarlar })).catch(() => {});
  }, [dil, ayarlar, ayarYuklendi]);

  // Giriş sonrası cihaz push token'ını kaydet (EAS/cihaz yoksa sessiz geçer)
  useEffect(() => {
    if (user) kayitPushToken(user.id);
  }, [user?.id]);

  const oynat = (video, baslik) => setGorunum({ tip: "oynat", video, baslik });

  return (
    <SafeAreaView style={s.kap}>
      <StatusBar style="light" />
      {gorunum.tip === "ana" && (
        <Ana
          d={d}
          user={user}
          girisAc={() => setGirisAcik(true)}
          ayarlarAc={() => setAyarlarAcik(true)}
          tabloAc={() => setGorunum({ tip: "tablo" })}
          oynat={oynat}
          ac={(id) => setGorunum({ tip: "detay", id })}
        />
      )}
      {gorunum.tip === "tablo" && (
        <Tablo
          d={d}
          user={user}
          girisAc={() => setGirisAcik(true)}
          geri={() => setGorunum({ tip: "ana" })}
        />
      )}
      {gorunum.tip === "detay" && (
        <Detay
          d={d}
          id={gorunum.id}
          user={user}
          girisAc={() => setGirisAcik(true)}
          oynat={oynat}
          geri={() => setGorunum({ tip: "ana" })}
        />
      )}
      {gorunum.tip === "oynat" && (
        <Oynatici
          d={d}
          video={gorunum.video}
          baslik={gorunum.baslik}
          user={user}
          altyaziDil={ayarlar.altyaziAcik ? ayarlar.altyaziDil || dil : ""}
          oynat={oynat}
          geri={() => setGorunum({ tip: "detay", id: gorunum.baslik.id })}
        />
      )}
      {girisAcik && <AuthModal d={d} kapat={() => setGirisAcik(false)} />}
      {ayarlarAcik && (
        <AyarlarModal
          d={d}
          dil={dil}
          setDil={setDil}
          ayarlar={ayarlar}
          setAyarlar={setAyarlar}
          kapat={() => setAyarlarAcik(false)}
        />
      )}
    </SafeAreaView>
  );
}

// ————— Ayarlar modalı: dil + alt yazı tercihi —————
function AyarlarModal({ d, dil, setDil, ayarlar, setAyarlar, kapat }) {
  const diller = Object.keys(METINLER);
  const DIL_ADI = {
    en: "English", tr: "Türkçe", es: "Español", de: "Deutsch", fr: "Français",
    ru: "Русский", ar: "العربية", zh: "中文",
  };

  const SecimSatiri = ({ etiket, secili, sec }) => (
    <TouchableOpacity style={s.secimSatiri} onPress={sec} activeOpacity={0.8}>
      <Text style={{ color: t.text, fontSize: 14 }}>{etiket}</Text>
      {secili && <Text style={{ color: t.accent, fontSize: 16 }}>✓</Text>}
    </TouchableOpacity>
  );

  return (
    <Modal transparent animationType="fade" onRequestClose={kapat}>
      <View style={s.modalArka}>
        <View style={[s.modalKart, { maxHeight: "85%" }]}>
          <Text style={s.modalBaslik}>{d.ayarlar}</Text>
          <ScrollView>
            {/* Dil */}
            <Text style={s.ayarBolum}>{d.dilEtiket}</Text>
            {diller.map((kod) => (
              <SecimSatiri
                key={kod}
                etiket={DIL_ADI[kod] ?? kod.toUpperCase()}
                secili={dil === kod}
                sec={() => setDil(kod)}
              />
            ))}

            {/* Alt yazı */}
            <Text style={s.ayarBolum}>{d.altyaziGoster}</Text>
            <View style={s.secimSatiri}>
              <Text style={{ color: t.text, fontSize: 14 }}>{d.altyaziGoster}</Text>
              <Switch
                value={ayarlar.altyaziAcik}
                onValueChange={(v) => setAyarlar((e) => ({ ...e, altyaziAcik: v }))}
                trackColor={{ true: t.accent, false: t.line }}
                thumbColor="#0A0A0B"
              />
            </View>

            {ayarlar.altyaziAcik && (
              <>
                <Text style={s.ayarBolum}>{d.altyaziDil}</Text>
                <SecimSatiri
                  etiket={d.arayuzDili}
                  secili={ayarlar.altyaziDil === ""}
                  sec={() => setAyarlar((e) => ({ ...e, altyaziDil: "" }))}
                />
                {diller.map((kod) => (
                  <SecimSatiri
                    key={kod}
                    etiket={DIL_ADI[kod] ?? kod.toUpperCase()}
                    secili={ayarlar.altyaziDil === kod}
                    sec={() => setAyarlar((e) => ({ ...e, altyaziDil: kod }))}
                  />
                ))}
              </>
            )}
          </ScrollView>

          <TouchableOpacity
            style={[s.izleDugme, { alignSelf: "stretch", alignItems: "center", marginTop: 16 }]}
            onPress={kapat}
          >
            <Text style={s.izleYazi}>{d.kapat}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ————— Giriş / kayıt modalı —————
function AuthModal({ d, kapat }) {
  const [kayit, setKayit] = useState(false);
  const [ad, setAd] = useState("");
  const [email, setEmail] = useState("");
  const [sifre, setSifre] = useState("");
  const [hata, setHata] = useState(null);
  const [mesaj, setMesaj] = useState(null);
  const [bekliyor, setBekliyor] = useState(false);

  async function gonder() {
    setHata(null);
    setMesaj(null);
    setBekliyor(true);
    const { error } = kayit ? await signUp(email, sifre, ad) : await signIn(email, sifre);
    setBekliyor(false);
    if (error) return setHata(error.message);
    if (kayit) setMesaj(d.kayitAlindi);
    else kapat(); // giriş başarılı → onAuthStateChange kullanıcıyı günceller
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={kapat}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={s.modalArka}
      >
        <View style={s.modalKart}>
          <Text style={s.modalBaslik}>{kayit ? d.kayitBaslik : d.girisBaslik}</Text>
          <Text style={[s.dim, { marginBottom: 16 }]}>{d.girisAlt}</Text>

          {kayit && (
            <TextInput
              style={s.modalAlan}
              placeholder={d.ad}
              placeholderTextColor={t.dim}
              value={ad}
              onChangeText={setAd}
            />
          )}
          <TextInput
            style={s.modalAlan}
            placeholder={d.eposta}
            placeholderTextColor={t.dim}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={s.modalAlan}
            placeholder={d.sifre}
            placeholderTextColor={t.dim}
            secureTextEntry
            value={sifre}
            onChangeText={setSifre}
          />

          {hata && <Text style={{ color: t.danger, fontSize: 13, marginBottom: 10 }}>{hata}</Text>}
          {mesaj && <Text style={{ color: t.text, fontSize: 13, marginBottom: 10 }}>{mesaj}</Text>}

          <TouchableOpacity
            style={[s.izleDugme, { alignSelf: "stretch", alignItems: "center", opacity: bekliyor ? 0.6 : 1 }]}
            onPress={gonder}
            disabled={bekliyor}
          >
            <Text style={s.izleYazi}>{bekliyor ? d.bekle : kayit ? d.kayitOl : d.girisYap}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setKayit(!kayit)} style={{ marginTop: 14, alignItems: "center" }}>
            <Text style={[s.dim, { textDecorationLine: "underline" }]}>{d.hesapGecis(kayit)}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={kapat} style={{ marginTop: 14, alignItems: "center" }}>
            <Text style={s.dim}>✕</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ————— Ana: hero + açıklamalı dikey akış + akıllı arama —————
function Ana({ d, user, girisAc, ayarlarAc, tabloAc, oynat, ac }) {
  const [katalog, setKatalog] = useState(null);
  const [hata, setHata] = useState(null);
  const [arama, setArama] = useState("");
  const [sonuclar, setSonuclar] = useState(null);
  // Filtre: önce tip (hepsi/film/dizi), kategoriler o tipin altında
  const [secTip, setSecTip] = useState("hepsi");
  const [secTur, setSecTur] = useState(null);
  // Kişisel raflar (girişli)
  const [devam, setDevam] = useState([]);
  const [listem, setListem] = useState([]);

  useEffect(() => {
    getCatalog().then(setKatalog).catch((e) => setHata(e.message));
  }, []);

  // Girişli kullanıcının devam et + Listem rafları
  useEffect(() => {
    if (!user) {
      setDevam([]);
      setListem([]);
      return;
    }
    let aktif = true;
    getContinueWatching(user.id).then((v) => aktif && setDevam(v)).catch(() => {});
    getMyList(user.id).then((v) => aktif && setListem(v)).catch(() => {});
    return () => {
      aktif = false;
    };
  }, [user?.id]);

  // Akıllı arama: yazarken anında (300 ms), adı sorguyla başlayanlar önde
  useEffect(() => {
    const sorgu = arama.trim();
    if (sorgu.length < 2) {
      setSonuclar(null);
      return;
    }
    const z = setTimeout(() => {
      searchTitles(sorgu)
        .then((liste) => {
          const kucuk = sorgu.toLocaleLowerCase();
          liste.sort((a, b) => {
            const aOncelik = a.name.toLocaleLowerCase().startsWith(kucuk) ? 0 : 1;
            const bOncelik = b.name.toLocaleLowerCase().startsWith(kucuk) ? 0 : 1;
            return aOncelik - bOncelik;
          });
          setSonuclar(liste);
        })
        .catch(() => setSonuclar([]));
    }, 300);
    return () => clearTimeout(z);
  }, [arama]);

  if (hata) return <Durum d={d} mesaj={d.sunucuYok(hata)} />;
  if (!katalog) return <Durum d={d} yukleniyor />;

  const hero = katalog[0];
  // Hero zaten en üstte; dikey akış kalanları açıklamalarıyla listeler
  const akis = katalog.slice(1);

  // Seçili tipe ait kategoriler (tip seçilince alt satırda çıkar)
  const turListesi =
    secTip === "hepsi"
      ? []
      : [
          ...new Set(
            katalog
              .filter((b) => b.kind === secTip)
              .map((b) => b.genre)
              .filter(Boolean)
          ),
        ].sort((a, b) => a.localeCompare(b));

  function tipSec(tip) {
    setSecTip(tip);
    setSecTur(null); // tip değişince kategori sıfırlanır
  }

  const suzgecAktif = secTip !== "hepsi";
  const suzulmus = suzgecAktif
    ? katalog.filter((b) => b.kind === secTip && (secTur === null || b.genre === secTur))
    : [];

  // Yatay kaydırılabilir çip satırları (arama açıkken gizli)
  const filtreCubugu = (
    <View style={{ paddingTop: 14 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        <Cip etiket={d.tumu} secili={secTip === "hepsi"} sec={() => tipSec("hepsi")} />
        <Cip etiket={d.filmler} secili={secTip === "film"} sec={() => tipSec("film")} />
        <Cip etiket={d.diziler} secili={secTip === "dizi"} sec={() => tipSec("dizi")} />
      </ScrollView>
      {turListesi.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, marginTop: 10 }}
        >
          {turListesi.map((tur) => (
            <Cip
              key={tur}
              etiket={tur}
              secili={secTur === tur}
              sec={() => setSecTur(secTur === tur ? null : tur)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );

  return (
    <ScrollView
      style={s.kap}
      contentContainerStyle={{ paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Marka + dil anahtarı + giriş/çıkış */}
      <View style={s.ustSatir}>
        <Text style={s.marka}>VAELO</Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TouchableOpacity style={s.dilDugme} onPress={tabloAc}>
            <Text style={s.dilYazi}>{d.tablo.etiket}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.dilDugme} onPress={ayarlarAc}>
            <Text style={[s.dilYazi, { fontSize: 15 }]}>⚙</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.dilDugme} onPress={() => (user ? signOut() : girisAc())}>
            <Text style={s.dilYazi}>{user ? d.cikis : d.girisYap}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <TextInput
        style={s.arama}
        placeholder={d.ara}
        placeholderTextColor={t.dim}
        value={arama}
        onChangeText={setArama}
      />

      {sonuclar !== null ? (
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={s.rafBaslik}>{d.sonuclar}</Text>
          {sonuclar.length === 0 && <Text style={s.dim}>{d.sonucYok}</Text>}
          {sonuclar.map((b) => (
            <SonucSatiri key={b.id} d={d} baslik={b} ac={ac} />
          ))}
        </View>
      ) : (
        <>
          {filtreCubugu}

          {suzgecAktif ? (
            <View style={{ paddingHorizontal: 16 }}>
              <Text style={s.rafBaslik}>{d.baslikSayisi(suzulmus.length)}</Text>
              {suzulmus.length === 0 ? (
                <Text style={s.dim}>{d.sonucYok}</Text>
              ) : (
                suzulmus.map((baslik) => (
                  <AkisKarti key={baslik.id} d={d} baslik={baslik} ac={ac} gomulu />
                ))
              )}
            </View>
          ) : !hero ? (
            <Durum d={d} mesaj={d.icerikYok} />
          ) : (
            <>
              {/* Kişisel raflar (girişli) */}
              {devam.length > 0 && (
                <YatayRaf
                  d={d}
                  ad={d.devamEt}
                  ogeler={devam.map((o) => ({ baslik: o.baslik, bas: () => oynat(o.video, o.baslik) }))}
                />
              )}
              {listem.length > 0 && (
                <YatayRaf
                  d={d}
                  ad={d.listem}
                  ogeler={listem.map((b) => ({ baslik: b, bas: () => ac(b.id) }))}
                />
              )}

              {/* Hero */}
              <TouchableOpacity style={s.hero} onPress={() => ac(hero.id)} activeOpacity={0.85}>
                {thumbUrl(hero.videos[0]?.cf_uid) && (
                  <Image source={{ uri: thumbUrl(hero.videos[0].cf_uid) }} style={s.heroKapak} />
                )}
                <View style={s.heroGovde}>
                  <Text style={s.ustBilgi}>
                    {[hero.kind === "dizi" ? d.DIZI : d.FILM, hero.genre, hero.year]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  <Text style={s.heroAd}>{hero.name}</Text>
                  {!!hero.description && (
                    <Text style={s.dim} numberOfLines={2}>
                      {hero.description}
                    </Text>
                  )}
                  <View style={s.izleDugme}>
                    <Text style={s.izleYazi}>{d.izle}</Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* Açıklamalı dikey akış */}
              {akis.map((baslik) => (
                <AkisKarti key={baslik.id} d={d} baslik={baslik} ac={ac} />
              ))}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

// Dikey akış kartı: geniş kapak + başlık + tür satırı + 3 satır açıklama.
// gomulu=true → dış kap zaten yatay dolgulu (süzülmüş ızgara).
function AkisKarti({ d, baslik, ac, gomulu }) {
  const kapak = thumbUrl(baslik.videos?.[0]?.cf_uid);
  return (
    <TouchableOpacity
      style={{ marginTop: gomulu ? 20 : 28, paddingHorizontal: gomulu ? 0 : 16 }}
      onPress={() => ac(baslik.id)}
      activeOpacity={0.85}
    >
      <View style={s.akisKapak}>
        {kapak ? (
          <Image source={{ uri: kapak }} style={{ width: "100%", height: "100%" }} />
        ) : (
          <Text style={[s.kartHarf, { fontSize: 40 }]}>
            {baslik.name?.[0]?.toUpperCase()}
          </Text>
        )}
      </View>
      <Text style={s.akisAd}>{baslik.name}</Text>
      <Text style={s.kartAlt}>
        {[baslik.kind === "dizi" ? d.dizi : d.film, baslik.genre, baslik.year]
          .filter(Boolean)
          .join(" · ")}
      </Text>
      {!!baslik.description && (
        <Text style={[s.dim, { marginTop: 6, lineHeight: 19 }]} numberOfLines={3}>
          {baslik.description}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// Akıllı arama sonucu: kapak solda, sağda ad + tür + 2 satır açıklama
function SonucSatiri({ d, baslik, ac }) {
  const kapak = thumbUrl(baslik.videos?.[0]?.cf_uid);
  return (
    <TouchableOpacity
      style={s.sonucSatiri}
      onPress={() => ac(baslik.id)}
      activeOpacity={0.85}
    >
      <View style={s.sonucKapak}>
        {kapak ? (
          <Image source={{ uri: kapak }} style={{ width: "100%", height: "100%" }} />
        ) : (
          <Text style={s.kartHarf}>{baslik.name?.[0]?.toUpperCase()}</Text>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.kartAd} numberOfLines={1}>
          {baslik.name}
        </Text>
        <Text style={s.kartAlt}>
          {[baslik.kind === "dizi" ? d.dizi : d.film, baslik.genre]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        {!!baslik.description && (
          <Text style={[s.dim, { fontSize: 12, marginTop: 3 }]} numberOfLines={2}>
            {baslik.description}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ————— Detay: bilgi + Listeme ekle + bölümler —————
function Detay({ d, id, user, girisAc, oynat, geri }) {
  const [baslik, setBaslik] = useState(null);
  const [hata, setHata] = useState(null);
  const [ekli, setEkli] = useState(null); // null: bilinmiyor

  useEffect(() => {
    getTitle(id).then(setBaslik).catch((e) => setHata(e.message));
    if (user) inMyList(user.id, id).then(setEkli);
    else setEkli(null);
  }, [id, user?.id]);

  async function listemDegistir() {
    if (!user) return girisAc();
    setEkli(!ekli); // iyimser
    await toggleMyList(user.id, id, ekli);
  }

  if (hata) return <Durum d={d} mesaj={hata} geri={geri} />;
  if (!baslik) return <Durum d={d} yukleniyor geri={geri} />;

  const dizi = baslik.kind === "dizi";

  return (
    <ScrollView style={s.kap} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <GeriButon d={d} geri={geri} />
      <Text style={[s.ustBilgi, { marginTop: 16 }]}>
        {[dizi ? d.DIZI : d.FILM, baslik.genre, baslik.year].filter(Boolean).join(" · ")}
      </Text>
      <Text style={s.detayAd}>{baslik.name}</Text>
      {!!baslik.description && (
        <Text style={[s.dim, { lineHeight: 21, marginBottom: 20 }]}>{baslik.description}</Text>
      )}

      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {!dizi && baslik.videos[0] && (
          <TouchableOpacity style={s.izleDugme} onPress={() => oynat(baslik.videos[0], baslik)}>
            <Text style={s.izleYazi}>{d.filmiIzle}</Text>
          </TouchableOpacity>
        )}
        {(user ? ekli !== null : true) && (
          <TouchableOpacity style={s.listemDugme} onPress={listemDegistir}>
            <Text style={{ color: ekli ? t.dim : t.text, fontSize: 14, fontWeight: "600" }}>
              {ekli ? d.listemde : d.listemeEkle}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {dizi &&
        baslik.videos.map((video) => (
          <TouchableOpacity
            key={video.id}
            style={s.bolumSatiri}
            onPress={() => oynat(video, baslik)}
            activeOpacity={0.85}
          >
            <Text style={[s.dim, { width: 52 }]}>
              {d.seb(video.season ?? 1, video.episode ?? 1)}
            </Text>
            <Text style={s.bolumAd} numberOfLines={1}>
              {video.name || d.bolumNo(video.episode ?? 1)}
            </Text>
            <Text style={s.dim}>▶</Text>
          </TouchableOpacity>
        ))}
    </ScrollView>
  );
}

// ————— Oynatıcı: YouTube düzeni — video üstte sabit, altı kaydırılabilir —————
function Oynatici({ d, video, baslik, user, altyaziDil, oynat, geri }) {
  // Açılışta izlenme kaydı (girişliyse user_id ile → "devam et"; bölüm değişince yenisi)
  useEffect(() => {
    logWatch(video.id, user?.id ?? null);
  }, [video.id]);

  const dizi = baslik.kind === "dizi";

  return (
    <View style={s.kap}>
      {/* İnce geri şeridi */}
      <TouchableOpacity onPress={geri} style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
        <Text style={s.dim}>{d.geri}</Text>
      </TouchableOpacity>

      {/* Video en üstte, tam genişlik, sabit */}
      <View style={{ aspectRatio: 16 / 9, backgroundColor: "#000" }}>
        <WebView
          key={video.id}
          source={{ uri: iframeUrl(video.cf_uid, altyaziDil) }}
          style={{ backgroundColor: "#000" }}
          allowsFullscreenVideo
          allowsInlineMediaPlayback
        />
      </View>

      {/* Altta kaydırılabilir bilgi + bölümler */}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <Text style={s.oynaticiAd}>{baslik.name}</Text>
        <Text style={[s.kartAlt, { marginTop: 4 }]}>
          {[
            dizi
              ? `${d.seb(video.season ?? 1, video.episode ?? 1)}${video.name ? ` — ${video.name}` : ""}`
              : d.film,
            baslik.genre,
            baslik.year,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        {!!baslik.description && (
          <Text style={[s.dim, { lineHeight: 21, marginTop: 12 }]}>
            {baslik.description}
          </Text>
        )}

        {/* Dizide bölüm listesi — çalan bölüm vurgulu, dokununca geçiş */}
        {dizi && baslik.videos?.length > 1 && (
          <>
            <Text style={s.altBaslik}>{d.bolumler}</Text>
            {baslik.videos.map((b) => {
              const caliyor = b.id === video.id;
              return (
                <TouchableOpacity
                  key={b.id}
                  style={[s.bolumSatiri, caliyor && { borderColor: t.accent }]}
                  onPress={() => !caliyor && oynat(b, baslik)}
                  activeOpacity={caliyor ? 1 : 0.85}
                >
                  <Text style={[s.dim, { width: 52 }, caliyor && { color: t.accent }]}>
                    {d.seb(b.season ?? 1, b.episode ?? 1)}
                  </Text>
                  <Text style={s.bolumAd} numberOfLines={1}>
                    {b.name || d.bolumNo(b.episode ?? 1)}
                  </Text>
                  <Text style={[s.dim, caliyor && { color: t.accent }]}>▶</Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// Yatay raf: küçük kapak kartları (devam et / Listem)
function YatayRaf({ d, ad, ogeler }) {
  return (
    <View style={{ marginTop: 24 }}>
      <Text style={[s.rafBaslik, { paddingHorizontal: 16 }]}>{ad}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      >
        {ogeler.map(({ baslik, bas }) => {
          const kapak = thumbUrl(baslik.videos?.[0]?.cf_uid);
          return (
            <TouchableOpacity key={baslik.id} style={{ width: 150 }} onPress={bas} activeOpacity={0.85}>
              <View style={s.yatayKapak}>
                {kapak ? (
                  <Image source={{ uri: kapak }} style={{ width: "100%", height: "100%" }} />
                ) : (
                  <Text style={s.kartHarf}>{baslik.name?.[0]?.toUpperCase()}</Text>
                )}
              </View>
              <Text style={s.kartAd} numberOfLines={1}>
                {baslik.name}
              </Text>
              <Text style={s.kartAlt}>
                {[baslik.kind === "dizi" ? d.dizi : d.film, baslik.genre].filter(Boolean).join(" · ")}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// Filtre çipi: seçiliyken lime dolgulu, değilken çerçeveli
function Cip({ etiket, secili, sec }) {
  return (
    <TouchableOpacity
      onPress={sec}
      style={[s.cip, secili ? s.cipSecili : s.cipPasif]}
      activeOpacity={0.85}
    >
      <Text style={[s.cipYazi, { color: secili ? "#0A0A0B" : t.dim }]}>{etiket}</Text>
    </TouchableOpacity>
  );
}

// ————— Ortak parçalar —————
function GeriButon({ d, geri }) {
  return (
    <TouchableOpacity onPress={geri}>
      <Text style={s.dim}>{d.geri}</Text>
    </TouchableOpacity>
  );
}

function Durum({ d, mesaj, yukleniyor, geri }) {
  return (
    <View style={[s.kap, { alignItems: "center", justifyContent: "center", padding: 32 }]}>
      {geri && <GeriButon d={d} geri={geri} />}
      {yukleniyor ? (
        <ActivityIndicator color={t.accent} size="large" />
      ) : (
        <Text style={[s.dim, { textAlign: "center", marginTop: 12 }]}>{mesaj}</Text>
      )}
    </View>
  );
}

// ————— Tablo: haftalık AI görsel yarışması (gönderim / anonim eleme / sergi) —————
function Tablo({ d, user, girisAc, geri }) {
  const [hafta, setHafta] = useState(undefined); // undefined: yükleniyor, null: yok
  const [hata, setHata] = useState(null);

  const yukle = () => {
    getBuHafta()
      .then(setHafta)
      .catch((e) => setHata(e.message));
  };
  useEffect(yukle, []);

  return (
    <ScrollView style={s.kap} contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={s.ustSatir}>
        <Text style={s.marka}>{d.tablo.baslik}</Text>
        <TouchableOpacity style={s.dilDugme} onPress={geri}>
          <Text style={s.dilYazi}>{d.geri}</Text>
        </TouchableOpacity>
      </View>

      {hata ? (
        <Durum d={d} mesaj={d.sunucuYok(hata)} />
      ) : hafta === undefined ? (
        <Durum d={d} yukleniyor />
      ) : !hafta ? (
        <Durum d={d} mesaj={d.tablo.yok} />
      ) : hafta.durum === "gonderim" ? (
        <ArtGonderim d={d} hafta={hafta} user={user} girisAc={girisAc} />
      ) : hafta.durum === "eleme" ? (
        <ArtEleme d={d} hafta={hafta} user={user} girisAc={girisAc} />
      ) : (
        <ArtSergi d={d} hafta={hafta} user={user} girisAc={girisAc} />
      )}
    </ScrollView>
  );
}

// Gönderim: haftada 1 eser (görsel + açıklama + sosyal link)
function ArtGonderim({ d, hafta, user, girisAc }) {
  const [benim, setBenim] = useState(undefined);
  const [varlik, setVarlik] = useState(null);
  const [aciklama, setAciklama] = useState("");
  const [sosyal, setSosyal] = useState("");
  const [durum, setDurum] = useState(null); // null | "gonderiliyor" | "oldu" | "hata"

  useEffect(() => {
    if (!user) return setBenim(null);
    getBenimEserim(hafta.id).then(setBenim).catch(() => setBenim(null));
  }, [user?.id, hafta.id]);

  async function gorselSec() {
    const izin = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!izin.granted) return;
    const sonuc = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!sonuc.canceled) setVarlik(sonuc.assets[0]);
  }

  async function gonder() {
    if (!varlik) return;
    setDurum("gonderiliyor");
    try {
      const guvenli = guvenliUrl(sosyal);
      const linkler = guvenli ? [{ tur: "link", url: guvenli }] : [];
      await eserGonder(hafta.id, user.id, varlik, aciklama, linkler);
      setDurum("oldu");
      getBenimEserim(hafta.id).then(setBenim).catch(() => {});
    } catch {
      setDurum("hata");
    }
  }

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
      <Text style={s.rafBaslik}>{d.tablo.gonderimBaslik}</Text>
      <Text style={[s.dim, { marginBottom: 14 }]}>{d.tablo.gonderimAlt}</Text>

      {!user ? (
        <TouchableOpacity style={s.izleDugme} onPress={girisAc}>
          <Text style={s.izleYazi}>{d.tablo.girisGerek}</Text>
        </TouchableOpacity>
      ) : benim ? (
        <View>
          <Image source={{ uri: benim.url }} style={s.artGorsel} resizeMode="contain" />
          <Text style={[s.dim, { marginTop: 10, color: t.accent }]}>{d.tablo.zatenGonderdin}</Text>
        </View>
      ) : durum === "oldu" ? (
        <Text style={{ color: t.accent, fontSize: 15, fontWeight: "600" }}>
          {d.tablo.gonderildi}
        </Text>
      ) : (
        <View>
          <TouchableOpacity style={s.artSecKutu} onPress={gorselSec} activeOpacity={0.85}>
            {varlik ? (
              <Image source={{ uri: varlik.uri }} style={s.artGorsel} resizeMode="contain" />
            ) : (
              <Text style={s.dim}>＋ {d.tablo.eserSec}</Text>
            )}
          </TouchableOpacity>
          <TextInput
            style={s.modalAlan}
            placeholder={d.tablo.aciklamaYer}
            placeholderTextColor={t.dim}
            value={aciklama}
            onChangeText={setAciklama}
            multiline
          />
          <TextInput
            style={s.modalAlan}
            placeholder={d.tablo.sosyalYer}
            placeholderTextColor={t.dim}
            value={sosyal}
            onChangeText={setSosyal}
            autoCapitalize="none"
          />
          {durum === "hata" && (
            <Text style={{ color: t.danger, marginBottom: 10 }}>{d.tablo.hata}</Text>
          )}
          <TouchableOpacity
            style={[
              s.izleDugme,
              { alignSelf: "stretch", alignItems: "center", opacity: !varlik || durum === "gonderiliyor" ? 0.5 : 1 },
            ]}
            disabled={!varlik || durum === "gonderiliyor"}
            onPress={gonder}
          >
            <Text style={s.izleYazi}>
              {durum === "gonderiliyor" ? d.tablo.gonderiliyor : d.tablo.gonder}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// İzleyici moderasyonu: eseri bildir (giriş gerekli)
function ArtBildirDugme({ d, user, pieceId, girisAc }) {
  const [ok, setOk] = useState(false);
  async function bildir() {
    if (!user) return girisAc();
    setOk(true); // iyimser
    await artBildir(pieceId, user.id);
  }
  return (
    <TouchableOpacity style={s.artBildirDugme} onPress={bildir} disabled={ok} activeOpacity={0.7}>
      <Text style={{ color: t.dim, fontSize: 12 }}>{ok ? d.tablo.bildirildi : d.tablo.bildir}</Text>
    </TouchableOpacity>
  );
}

// Anonim eleme: sahip GİZLİ; kullanıcı beğendiği eserlere oy verir
function ArtEleme({ d, hafta, user, girisAc }) {
  const [set, setSet] = useState(null);
  const [oyluIds, setOyluIds] = useState([]);

  useEffect(() => {
    if (!user) return;
    getOySeti(hafta.id).then(setSet).catch(() => setSet([]));
  }, [user?.id, hafta.id, hafta.tur]);

  async function oyVer(pieceId) {
    setOyluIds((e) => [...e, pieceId]);
    await artOyVer(pieceId, user.id, hafta.tur);
  }

  if (!user) {
    return (
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <Text style={s.rafBaslik}>{d.tablo.elemeBaslik}</Text>
        <TouchableOpacity style={s.izleDugme} onPress={girisAc}>
          <Text style={s.izleYazi}>{d.tablo.girisGerek}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
      <Text style={s.rafBaslik}>{d.tablo.elemeBaslik}</Text>
      <Text style={[s.dim, { marginBottom: 14 }]}>{d.tablo.elemeAlt}</Text>
      {set === null ? (
        <Durum d={d} yukleniyor />
      ) : set.length === 0 ? (
        <Text style={s.dim}>{d.tablo.setBitti}</Text>
      ) : (
        set.map((e) => {
          const oyladi = oyluIds.includes(e.id);
          return (
            <View key={e.id} style={{ marginBottom: 20 }}>
              <Image source={{ uri: e.url }} style={s.artGorsel} resizeMode="contain" />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <TouchableOpacity
                  style={[s.artOyDugme, oyladi && { backgroundColor: t.accent, borderColor: t.accent }]}
                  disabled={oyladi}
                  onPress={() => oyVer(e.id)}
                >
                  <Text style={{ color: oyladi ? "#0A0A0B" : t.text, fontWeight: "700", fontSize: 14 }}>
                    {oyladi ? d.tablo.oylandi : d.tablo.oyla}
                  </Text>
                </TouchableOpacity>
                <ArtBildirDugme d={d} user={user} pieceId={e.id} girisAc={girisAc} />
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

// Sergi: son 50, oy sıralı, SAHİPLİ + sosyal linkler; hâlâ puanlanabilir (tur 999)
function ArtSergi({ d, hafta, user, girisAc }) {
  const [liste, setListe] = useState(null);
  const [oyluIds, setOyluIds] = useState([]);

  useEffect(() => {
    getSergi(hafta.id).then(setListe).catch(() => setListe([]));
  }, [hafta.id]);

  async function puanla(pieceId) {
    if (!user) return girisAc();
    setOyluIds((e) => [...e, pieceId]);
    await artOyVer(pieceId, user.id, 999);
  }

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
      <Text style={s.rafBaslik}>{d.tablo.sergiBaslik}</Text>
      <Text style={[s.dim, { marginBottom: 14 }]}>{d.tablo.sergiAlt}</Text>
      {liste === null ? (
        <Durum d={d} yukleniyor />
      ) : liste.length === 0 ? (
        <Text style={s.dim}>{d.tablo.yok}</Text>
      ) : (
        liste.map((e, i) => {
          const oyladi = oyluIds.includes(e.id);
          return (
            <View key={e.id} style={{ marginBottom: 24 }}>
              <Text style={[s.dim, { fontWeight: "800", color: t.accent }]}>#{i + 1}</Text>
              <Image source={{ uri: e.url }} style={s.artGorsel} resizeMode="contain" />
              <Text style={{ color: t.text, fontWeight: "700", fontSize: 15, marginTop: 8 }}>
                {e.sahip_ad || d.tablo.anonim}
              </Text>
              {e.aciklama ? <Text style={[s.dim, { marginTop: 2 }]}>{e.aciklama}</Text> : null}
              {(e.sosyal || []).map((l, j) => {
                const gu = guvenliUrl(l.url); // güvenli değilse dokunulamaz düz metin
                return gu ? (
                  <TouchableOpacity key={j} onPress={() => Linking.openURL(gu)}>
                    <Text style={{ color: t.accent, fontSize: 13, marginTop: 4 }}>↗ {gu}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text key={j} style={{ color: t.dim, fontSize: 13, marginTop: 4 }}>
                    ↗ {String(l.url)}
                  </Text>
                );
              })}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 }}>
                <Text style={s.dim}>{d.tablo.oySay(Number(e.oy))}</Text>
                <TouchableOpacity
                  style={[s.artOyDugme, { marginTop: 0 }, oyladi && { backgroundColor: t.accent, borderColor: t.accent }]}
                  disabled={oyladi}
                  onPress={() => puanla(e.id)}
                >
                  <Text style={{ color: oyladi ? "#0A0A0B" : t.text, fontWeight: "700", fontSize: 13 }}>
                    {oyladi ? d.tablo.oylandi : d.tablo.oyla}
                  </Text>
                </TouchableOpacity>
                <ArtBildirDugme d={d} user={user} pieceId={e.id} girisAc={girisAc} />
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const s = StyleSheet.create({
  kap: { flex: 1, backgroundColor: t.bg },
  ustSatir: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  marka: { color: t.text, fontSize: 20, fontWeight: "800", letterSpacing: 2 },
  dilDugme: {
    borderColor: t.line,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  dilYazi: { color: t.dim, fontSize: 12, letterSpacing: 1 },
  cip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  cipSecili: { backgroundColor: t.accent },
  cipPasif: { borderColor: t.line, borderWidth: 1 },
  cipYazi: { fontSize: 13, fontWeight: "600" },
  yatayKapak: {
    width: 150,
    height: 84,
    borderRadius: 8,
    backgroundColor: t.surface2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  listemDugme: {
    borderColor: t.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  modalArka: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 24,
  },
  modalKart: {
    backgroundColor: t.surface,
    borderColor: t.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 24,
  },
  modalBaslik: { color: t.text, fontSize: 22, fontWeight: "800", marginBottom: 4 },
  ayarBolum: {
    color: t.dim,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 18,
    marginBottom: 6,
  },
  secimSatiri: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomColor: t.line,
    borderBottomWidth: 1,
  },
  modalAlan: {
    backgroundColor: t.surface2,
    borderColor: t.line,
    borderWidth: 1,
    borderRadius: 8,
    color: t.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  arama: {
    margin: 16,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: t.surface2,
    borderColor: t.line,
    borderWidth: 1,
    borderRadius: 8,
    color: t.text,
    fontSize: 14,
  },
  hero: { marginTop: 12 },
  heroKapak: { width: "100%", height: 210, opacity: 0.75 },
  heroGovde: { padding: 16, gap: 6 },
  ustBilgi: { color: t.dim, fontSize: 12, letterSpacing: 1 },
  heroAd: { color: t.text, fontSize: 30, fontWeight: "800", lineHeight: 34 },
  izleDugme: {
    backgroundColor: t.accent,
    borderRadius: 8,
    paddingHorizontal: 22,
    paddingVertical: 11,
    marginTop: 10,
    alignSelf: "flex-start",
  },
  izleYazi: { color: "#0A0A0B", fontWeight: "700", fontSize: 14 },
  rafBaslik: {
    color: t.text,
    fontSize: 17,
    fontWeight: "700",
    marginTop: 20,
    marginBottom: 6,
  },
  akisKapak: {
    aspectRatio: 16 / 9,
    borderRadius: 10,
    backgroundColor: t.surface2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  akisAd: { color: t.text, fontSize: 17, fontWeight: "700", marginTop: 10 },
  sonucSatiri: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
    alignItems: "flex-start",
  },
  sonucKapak: {
    width: 120,
    height: 68,
    borderRadius: 8,
    backgroundColor: t.surface2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  kartHarf: { color: t.line, fontSize: 24, fontWeight: "800" },
  kartAd: { color: t.text, fontSize: 14, fontWeight: "600" },
  kartAlt: { color: t.dim, fontSize: 12, marginTop: 2 },
  dim: { color: t.dim, fontSize: 13 },
  detayAd: { color: t.text, fontSize: 26, fontWeight: "800", marginVertical: 8 },
  altBaslik: { color: t.text, fontSize: 16, fontWeight: "700", marginTop: 24, marginBottom: 4 },
  bolumSatiri: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: t.surface,
    borderColor: t.line,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginTop: 8,
  },
  bolumAd: { color: t.text, fontSize: 14, fontWeight: "600", flex: 1 },
  oynaticiAd: { color: t.text, fontSize: 18, fontWeight: "700" },
  artGorsel: {
    width: "100%",
    height: 300,
    borderRadius: 10,
    backgroundColor: t.surface2,
  },
  artSecKutu: {
    width: "100%",
    minHeight: 180,
    borderRadius: 10,
    borderColor: t.line,
    borderWidth: 1,
    borderStyle: "dashed",
    backgroundColor: t.surface2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    padding: 12,
  },
  artOyDugme: {
    alignSelf: "flex-start",
    borderColor: t.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
    marginTop: 10,
  },
  artBildirDugme: {
    borderColor: t.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 10,
  },
});
