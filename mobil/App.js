// Vaelo mobil (Expo) — ince izleyici istemcisi: web ile AYNI Supabase backend'i.
// Düzen: Keşfet = hero + AÇIKLAMALI dikey akış (YouTube/Netflix mobil hissi);
// oynatıcı = video üstte sabit, altında kaydırılabilir bilgi + bölüm listesi;
// arama = yazarken anında, ada göre akıllı sıralı, kapak+açıklamalı zengin satırlar.
// Dil: varsayılan İngilizce, başlıktaki anahtar döngüsel (sözlük: mobil/i18n.js).
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
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
import { Image as ExpoImage } from "expo-image";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
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
  getPlatformMode,
  getPromoBanner,
  getVideoPuan,
  puanVer,
  getUreticiProfil,
  getUreticiIcerikleri,
  sosyalUrl,
  profilGetir,
  takmaAdAyarla,
  profilGuncelle,
  getBenimIceriklerim,
  icerikSil,
  benimBasliklarim,
  baslikOlustur,
  createUpload,
  getYarismaVerisi,
  voteContest,
  enterContest,
  getCreatorStats,
  getOneri,
  getCreatorBasvurum,
  creatorBasvur,
  pilotVideoYukle,
} from "./api";
import {
  useAuth,
  signIn,
  signUp,
  signOut,
  signInWithGoogle,
  sifreSifirla,
  sifreGuncelle,
  recoveryOturumuKur,
} from "./auth";
import { METINLER } from "./i18n";
import Topluluk from "./Topluluk";

// Tasarım token'ları — web'deki theme.js ile aynı değerler
const t = {
  bg: "#0A0A0B",
  surface: "#121214",
  surface2: "#15151A",
  line: "#222226",
  text: "#ECEEE9",
  dim: "#8C8F88",
  accent: "#FF4DBD", // marka pembe — kenarlık/metin/nokta/halka (katı). Dolgular <Gradyan/>.
  danger: "#E2574C",
};

const AYAR_ANAHTAR = "latent_mobil_ayarlar";

// Haptik dokunuş yardımcıları — premium his için sekme/CTA etkileşimlerinde.
// Web'de veya haptics desteklemeyen cihazda sessizce no-op (try/catch).
function dokunHafif() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
function dokunOrta() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}
function dokunBasari() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

// Marka gradient — RN'de CSS gradient yok; buton/çip kutularının mutlak-dolgu arka planı
// olarak kullanılır (kap overflow:hidden + position relative). accent (katı pembe) kenarlık/
// metin/nokta için kalır; dolgular bu gradient'i alır (masaüstüyle aynı marka).
const MARKA_GRADIENT = ["#FF7A45", "#FF4DBD", "#A855F7"];
function Gradyan() {
  return (
    <LinearGradient
      colors={MARKA_GRADIENT}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
  );
}

// ————— Kaydırarak geri (Instagram/iOS tarzı) —————
// Sol kenardan (≤32px) sağa yatay kaydırma → ekran parmağı izler, eşiği geçince geri.
// Yalnız yatay kenar hareketinde devreye girer → dikey kaydırma/WebView/raflarla çakışmaz.
function KaydirGeri({ onGeri, children }) {
  const genislik = Dimensions.get("window").width;
  const tx = useRef(new Animated.Value(0)).current;
  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (e, g) => {
        const baslangicX = e.nativeEvent.pageX - g.dx; // dokunuşun başladığı x
        return baslangicX <= 32 && g.dx > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6;
      },
      onPanResponderMove: (e, g) => {
        if (g.dx > 0) tx.setValue(g.dx);
      },
      onPanResponderRelease: (e, g) => {
        if (g.dx > genislik * 0.33 || g.vx > 0.5) {
          Animated.timing(tx, { toValue: genislik, duration: 180, useNativeDriver: true }).start(() => onGeri());
        } else {
          Animated.spring(tx, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(tx, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
    })
  ).current;
  return (
    <Animated.View style={{ flex: 1, transform: [{ translateX: tx }] }} {...responder.panHandlers}>
      {children}
    </Animated.View>
  );
}

// ————— Premium alt navigasyon —————
// Yüzen, yuvarlak, yükseltilmiş koyu yüzey; aktif sekme gradient pill (fade) + hafif
// ölçek animasyonu (250ms); pasif gri. iOS güvenli alanına (home indicator) saygılı.
const SEKME_TANIM = [
  { id: "home", ikon: "home-outline", aktifIkon: "home", et: "navHome" },
  { id: "discover", ikon: "search-outline", aktifIkon: "search", et: "navDiscover" },
  { id: "sanat", ikon: "color-palette-outline", aktifIkon: "color-palette", et: "navArt" },
  { id: "upload", ikon: "cloud-upload-outline", aktifIkon: "cloud-upload", et: "navUpload" },
  { id: "studio", ikon: "film-outline", aktifIkon: "film", et: "navStudio" },
  { id: "profile", ikon: "person-outline", aktifIkon: "person", et: "navProfile" },
];
function AltNav({ d, sekme, setSekme }) {
  const inset = useSafeAreaInsets();
  return (
    <View style={[s.altNavSar, { paddingBottom: Math.max(inset.bottom, 12) }]} pointerEvents="box-none">
      <View style={s.altNav}>
        {SEKME_TANIM.map((sk) => (
          <AltNavOge
            key={sk.id}
            sk={sk}
            etiket={d[sk.et]}
            aktif={sekme === sk.id}
            bas={() => setSekme(sk.id)}
          />
        ))}
      </View>
    </View>
  );
}
function AltNavOge({ sk, etiket, aktif, bas }) {
  const anim = useRef(new Animated.Value(aktif ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: aktif ? 1 : 0, duration: 250, useNativeDriver: true }).start();
  }, [aktif]);
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  return (
    <TouchableOpacity
      style={s.altNavOge}
      onPress={() => {
        dokunHafif();
        bas();
      }}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: aktif }}
      accessibilityLabel={etiket}
    >
      <Animated.View style={[s.altNavPill, { transform: [{ scale }] }]}>
        {/* Gradient hep var; opaklık aktifken 1'e geçer (yumuşak fade) */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: anim }]}>
          <Gradyan />
        </Animated.View>
        <Ionicons name={aktif ? sk.aktifIkon : sk.ikon} size={20} color={aktif ? "#0A0A0B" : t.dim} />
        <Text
          style={{
            color: aktif ? "#0A0A0B" : t.dim,
            fontSize: 10,
            fontWeight: aktif ? "700" : "500",
            marginTop: 2,
          }}
        >
          {etiket}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ————— Profil sekmesi: hesap + dil/alt yazı + çıkış (giriş yoksa çağrı) —————
function ProfilEkrani({ d, user, dil, setDil, ayarlar, setAyarlar, girisAc }) {
  const diller = Object.keys(METINLER);
  const DIL_ADI = {
    en: "English", tr: "Türkçe", es: "Español", de: "Deutsch", fr: "Français",
    ru: "Русский", ar: "العربية", zh: "中文",
  };
  const p = d.profil;
  const Satir = ({ etiket, secili, sec }) => (
    <TouchableOpacity style={s.secimSatiri} onPress={sec} activeOpacity={0.8}>
      <Text style={{ color: t.text, fontSize: 14 }}>{etiket}</Text>
      {secili && <Text style={{ color: t.accent, fontSize: 16 }}>✓</Text>}
    </TouchableOpacity>
  );

  // Profil: görüntüleme/düzenleme modu + kendi içerikleri (web Profile.jsx ile aynı backend)
  const [profil, setProfil] = useState(null);
  const [duzenle, setDuzenle] = useState(false);
  const [ad, setAd] = useState("");
  const [bio, setBio] = useState("");
  const [sosyal, setSosyal] = useState({ instagram: "", tiktok: "", youtube: "", twitter: "", website: "" });
  const [kayd, setKayd] = useState(null); // null | "kaydediliyor" | "oldu"
  const [pHata, setPHata] = useState(null);
  const [icerikler, setIcerikler] = useState([]); // üreticinin kendi içerikleri
  const [siliniyor, setSiliniyor] = useState(null); // silinen title id
  useEffect(() => {
    if (!user) { setProfil(null); setIcerikler([]); return; }
    let aktif = true;
    profilGetir(user.id).then((pr) => {
      if (!aktif) return;
      setProfil(pr);
      setAd(pr.display_name ?? "");
      setBio(pr.bio ?? "");
      setSosyal({ instagram: pr.instagram ?? "", tiktok: pr.tiktok ?? "", youtube: pr.youtube ?? "", twitter: pr.twitter ?? "", website: pr.website ?? "" });
    }).catch(() => {});
    getBenimIceriklerim(user.id).then((v) => aktif && setIcerikler(v)).catch(() => {});
    return () => { aktif = false; };
  }, [user?.id]);
  const uretici = profil?.role === "creator" || profil?.role === "admin";
  const alan = { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.line, borderRadius: 10, color: t.text, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10, marginTop: 6 };

  async function kaydet() {
    if (!user || kayd === "kaydediliyor") return;
    setKayd("kaydediliyor"); setPHata(null);
    const yeniAd = ad.trim();
    if (yeniAd !== (profil?.display_name ?? "") || !profil?.display_name_chosen) {
      const r = await takmaAdAyarla(yeniAd, (dil || "en").slice(0, 2));
      if (r.hata) { setKayd(null); setPHata(p.hata[r.kod] ?? p.hata.sunucu); return; }
    }
    if (uretici) {
      const bosNull = (x) => { const v = (x || "").trim(); return v || null; };
      try {
        await profilGuncelle(user.id, {
          bio: bosNull(bio),
          instagram: bosNull(sosyal.instagram), tiktok: bosNull(sosyal.tiktok),
          youtube: bosNull(sosyal.youtube), twitter: bosNull(sosyal.twitter), website: bosNull(sosyal.website),
        });
      } catch { setKayd(null); setPHata(p.hata.sunucu); return; }
    }
    setProfil((e) => ({ ...(e || {}), display_name: yeniAd, display_name_chosen: true, bio, ...sosyal }));
    setKayd("oldu");
    setDuzenle(false);
  }
  function iptal() {
    setAd(profil?.display_name ?? ""); setBio(profil?.bio ?? "");
    setSosyal({ instagram: profil?.instagram ?? "", tiktok: profil?.tiktok ?? "", youtube: profil?.youtube ?? "", twitter: profil?.twitter ?? "", website: profil?.website ?? "" });
    setPHata(null); setKayd(null); setDuzenle(false);
  }
  // Silme: onay dialogu → cascade (videolar/izlenme/oy/listem/yarışma) sql/38
  function icerikSilOnay(baslik) {
    Alert.alert(baslik.name, p.silOnay, [
      { text: p.iptal, style: "cancel" },
      { text: p.sil, style: "destructive", onPress: async () => {
        setSiliniyor(baslik.id);
        const { error } = await icerikSil(baslik.id);
        if (!error) setIcerikler((l) => l.filter((x) => x.id !== baslik.id));
        setSiliniyor(null);
      } },
    ]);
  }

  return (
    <ScrollView style={s.kap} contentContainerStyle={{ padding: 16, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
      <ExpoImage
        source={require("./assets/vaelo_horizontal_lockup_transparent.png")}
        style={{ height: 24, width: 77, marginBottom: 18 }}
        contentFit="contain"
        accessibilityLabel="Vaelo"
      />
      {user ? (
        <>
          {/* Üst bölüm: avatar + ad + üretici rozeti + içerik sayısı + Düzenle (herkes görür) */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 54, height: 54, borderRadius: 27, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
              <Gradyan />
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: t.surface2, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: t.accent, fontSize: 20, fontWeight: "800" }}>{((ad || user.email)?.[0] || "?").toUpperCase()}</Text>
              </View>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: "700" }} numberOfLines={1}>{ad || user.email}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                {uretici && <Text style={{ color: t.accent, fontSize: 11, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" }}>{d.uretici}</Text>}
                {uretici ? (
                  <Text style={[s.dim, { fontSize: 12 }]}>{icerikler.length} 🎬</Text>
                ) : (
                  <Text style={[s.dim, { fontSize: 12 }]} numberOfLines={1}>{user.email}</Text>
                )}
              </View>
            </View>
            {!duzenle && (
              <TouchableOpacity onPress={() => setDuzenle(true)} style={s.listemDugme} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Text style={{ color: t.text, fontSize: 13, fontWeight: "600" }}>✏ {p.duzenle}</Text>
              </TouchableOpacity>
            )}
          </View>

          {duzenle ? (
            /* Düzenleme modu (inline toggle): ad + (üretici: bio/sosyal) + Kaydet/İptal */
            <>
              <Text style={s.ayarBolum}>{p.gorunenAd}</Text>
              <TextInput value={ad} onChangeText={(x) => { setAd(x); setKayd(null); }} style={alan}
                placeholder={p.gorunenAd} placeholderTextColor={t.dim} autoCapitalize="none" maxLength={20} />
              {uretici && (
                <View style={{ marginTop: 18, padding: 14, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 12 }}>
                  <Text style={{ color: t.accent, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>{d.uretici}</Text>
                  <Text style={[s.dim, { fontSize: 12, marginTop: 10 }]}>{p.bio}</Text>
                  <TextInput value={bio} onChangeText={(x) => { setBio(x); setKayd(null); }}
                    style={[alan, { minHeight: 72, textAlignVertical: "top", marginTop: 4 }]} multiline maxLength={300}
                    placeholder={p.bio} placeholderTextColor={t.dim} />
                  <Text style={[s.dim, { fontSize: 12, marginTop: 12 }]}>{p.sosyal}</Text>
                  {[["instagram", "Instagram"], ["tiktok", "TikTok"], ["youtube", "YouTube"], ["twitter", "X"], ["website", d.website]].map(([k, lbl]) => (
                    <TextInput key={k} value={sosyal[k]} onChangeText={(x) => { setSosyal((sc) => ({ ...sc, [k]: x })); setKayd(null); }}
                      style={[alan, { marginTop: 6 }]} placeholder={lbl} placeholderTextColor={t.dim} autoCapitalize="none" autoCorrect={false} />
                  ))}
                </View>
              )}
              {pHata && <Text style={{ color: t.danger, fontSize: 13, marginTop: 10 }}>{pHata}</Text>}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                <TouchableOpacity style={[s.izleDugme, { opacity: kayd === "kaydediliyor" ? 0.6 : 1 }]} onPress={kaydet} disabled={kayd === "kaydediliyor"}>
                  <Gradyan />
                  <Text style={s.izleYazi}>{p.kaydet}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.listemDugme} onPress={iptal}>
                  <Text style={{ color: t.dim, fontSize: 14, fontWeight: "600" }}>{p.iptal}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            /* İçerik bölümü: üreticinin yüklediği içerikler + sil (yalnız kendi profili) */
            uretici ? (
              <View style={{ marginTop: 22 }}>
                {icerikler.length === 0 ? (
                  <Text style={[s.dim, { textAlign: "center", paddingVertical: 20 }]}>{p.icerikYok}</Text>
                ) : (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
                    {icerikler.map((b) => (
                      <View key={String(b.id)} style={{ width: "48%", marginBottom: 16, opacity: siliniyor === b.id ? 0.4 : 1 }}>
                        <View style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 10, overflow: "hidden", backgroundColor: t.surface2 }}>
                          <Kapak baslik={b} harf={28} />
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ color: t.text, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>{b.name}</Text>
                            <Text style={{ color: t.dim, fontSize: 11 }} numberOfLines={1}>
                              {turAdi(b.kind, d)}{b.status !== "published" ? ` · ${d.studyo.durum[b.status] ?? b.status}` : ""}
                            </Text>
                          </View>
                          <TouchableOpacity onPress={() => icerikSilOnay(b)} disabled={siliniyor === b.id} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="trash-outline" size={18} color={t.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ) : null
          )}

          {/* Çıkış — formun DIŞINDA (kazara basılmasın) */}
          {!duzenle && (
            <TouchableOpacity style={[s.listemDugme, { alignSelf: "flex-start", marginTop: 22 }]} onPress={() => signOut()}>
              <Text style={{ color: t.dim, fontSize: 14, fontWeight: "600" }}>{d.cikis}</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <>
          <Text style={[s.dim, { marginBottom: 12 }]}>{d.girisAlt}</Text>
          <TouchableOpacity style={[s.izleDugme, { alignSelf: "flex-start" }]} onPress={girisAc}>
            <Gradyan />
            <Text style={s.izleYazi}>{d.girisYap}</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Ayarlar bölümü — ayırıcı */}
      <View style={{ height: 1, backgroundColor: t.line, marginTop: 26 }} />
      <Text style={s.ayarBolum}>{d.dilEtiket}</Text>
      {diller.map((kod) => (
        <Satir key={kod} etiket={DIL_ADI[kod] ?? kod.toUpperCase()} secili={dil === kod} sec={() => setDil(kod)} />
      ))}

      <View style={[s.secimSatiri, { marginTop: 8 }]}>
        <Text style={{ color: t.text, fontSize: 14 }}>{d.altyaziGoster}</Text>
        <Switch
          value={ayarlar.altyaziAcik}
          onValueChange={(v) => setAyarlar((e) => ({ ...e, altyaziAcik: v }))}
          trackColor={{ true: t.accent, false: t.line }}
          thumbColor="#0A0A0B"
        />
      </View>
    </ScrollView>
  );
}


// ————— Mobil Üretici Başvurusu: web CreatorBasvuru ile AYNI backend/geçit —————
// Onaysız yükleme YOK. Kısa mesaj + opsiyonel pilot video (expo-image-picker → 'pilot' bucket).
// Onaylanınca role='creator' → App() rolü tazeleyince Yükle/Stüdyo açılır.
function MobilBasvuru({ d, user, girisAc }) {
  const u = d.basvuru;
  const [durum, setDurum] = useState(undefined); // undefined:yük · null:yok · {durum}
  const [mesaj, setMesaj] = useState("");
  const [varlik, setVarlik] = useState(null); // pilot video (opsiyonel)
  const [gonderiliyor, setGonderiliyor] = useState(false);

  useEffect(() => {
    if (!user) return setDurum(null);
    getCreatorBasvurum(user.id).then(setDurum).catch(() => setDurum(null));
  }, [user?.id]);

  async function videoSec() {
    try {
      const izin = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!izin.granted) return;
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, quality: 1 });
      if (!r.canceled && r.assets?.[0]) setVarlik(r.assets[0]);
    } catch { /* iptal / izin yok */ }
  }

  async function gonder() {
    if (gonderiliyor) return;
    setGonderiliyor(true);
    try {
      let pilotUrl = null, pilotPath = null;
      if (varlik) {
        const r = await pilotVideoYukle(user.id, varlik); // 'pilot' bucket → { path, url }
        pilotUrl = r.url; pilotPath = r.path;
      }
      const { error } = await creatorBasvur(user.id, mesaj.trim(), pilotUrl, pilotPath);
      if (!error) setDurum({ durum: "beklemede" });
    } catch { /* yükleme/başvuru hatası → durum değişmez, kullanıcı tekrar dener */ }
    setGonderiliyor(false);
  }

  if (!user) {
    return (
      <View style={[s.kap, { alignItems: "center", justifyContent: "center", padding: 32, paddingBottom: 120 }]}>
        <Ionicons name="ribbon-outline" size={46} color={t.dim} />
        <Text style={[s.modalBaslik, { marginTop: 16 }]}>{u.baslik}</Text>
        <Text style={[s.dim, { textAlign: "center", marginTop: 8 }]}>{u.girisGerek}</Text>
        <TouchableOpacity style={[s.izleDugme, { marginTop: 20 }]} onPress={girisAc}>
          <Gradyan /><Text style={s.izleYazi}>{d.girisYap}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (durum === undefined) {
    return <View style={[s.kap, { alignItems: "center", justifyContent: "center", paddingBottom: 120 }]}><ActivityIndicator color={t.accent} /></View>;
  }

  const dr = durum?.durum;
  const alan = { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.line, borderRadius: 10, color: t.text, fontSize: 14, padding: 12, marginTop: 16, minHeight: 96, textAlignVertical: "top" };

  return (
    <ScrollView style={s.kap} contentContainerStyle={{ padding: 20, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
      <Text style={s.oynaticiAd}>{u.baslik}</Text>
      <Text style={[s.dim, { fontSize: 14, marginTop: 6, lineHeight: 20 }]}>{u.aciklama}</Text>

      {dr === "beklemede" || dr === "onaylandi" ? (
        <View style={{ marginTop: 22, borderWidth: 1, borderColor: t.accent, borderRadius: 12, padding: 16, backgroundColor: t.surface }}>
          <Text style={{ color: t.accent, fontWeight: "600", fontSize: 15, lineHeight: 21 }}>{dr === "onaylandi" ? u.onaylandi : u.beklemede}</Text>
        </View>
      ) : (
        <>
          {dr === "reddedildi" && (
            <View style={{ marginTop: 18, borderWidth: 1, borderColor: t.danger, borderRadius: 12, padding: 16, backgroundColor: t.surface }}>
              <Text style={{ color: t.danger, fontWeight: "600", fontSize: 15 }}>{u.reddedildi}</Text>
            </View>
          )}
          <TextInput value={mesaj} onChangeText={setMesaj} style={alan} placeholder={u.mesajYer} placeholderTextColor={t.dim} multiline />

          {/* Pilot video (opsiyonel) — 'pilot' bucket'ına yüklenir, başvuruya bağlanır */}
          <Text style={{ color: t.text, fontWeight: "600", fontSize: 15, marginTop: 22 }}>{u.pilotBaslik}</Text>
          <Text style={[s.dim, { fontSize: 13, marginTop: 4, lineHeight: 19 }]}>{u.pilotAciklama}</Text>
          <TouchableOpacity onPress={videoSec} style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: varlik ? t.accent : t.line, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: t.surface2 }}>
            <Ionicons name={varlik ? "checkmark-circle" : "videocam-outline"} size={20} color={varlik ? t.accent : t.dim} />
            <Text style={{ color: varlik ? t.accent : t.text, fontWeight: "600", fontSize: 14 }}>{varlik ? u.pilotSecili : u.pilotSec}</Text>
          </TouchableOpacity>
          {varlik && <Text style={[s.dim, { fontSize: 12, marginTop: 6 }]} numberOfLines={1}>{varlik.fileName || varlik.uri.split("/").pop()}</Text>}

          <TouchableOpacity style={[s.izleDugme, { marginTop: 24, opacity: gonderiliyor ? 0.6 : 1 }]} onPress={gonder} disabled={gonderiliyor}>
            <Gradyan />
            <Text style={s.izleYazi}>{dr === "reddedildi" ? u.tekrarGonder : u.gonder}</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

// ————— Mobil Yükle: native video yükleme (web Upload.jsx akışının aynısı) —————
// Video seç (expo-image-picker) → (yeni ise) başlık oluştur → create-upload imzalı URL →
// dosyayı DOĞRUDAN Cloudflare'e XHR ile gönder (ilerleme). Kategori: kısa/uzun film · dizi.
function MobilYukle({ d, user, girisAc }) {
  const y = d.yukle;
  const [basliklar, setBasliklar] = useState([]);
  const [hedef, setHedef] = useState("yeni"); // "yeni" | başlık id
  const [ad, setAd] = useState("");
  const [kind, setKind] = useState("kisa_film"); // kisa_film | uzun_film | dizi
  const [tur, setTur] = useState("");
  const [yil, setYil] = useState(String(new Date().getFullYear()));
  const [aciklama, setAciklama] = useState("");
  const [haftalik, setHaftalik] = useState(false);
  const [icerikTipi, setIcerikTipi] = useState("ana"); // ana | yapim
  const [sezon, setSezon] = useState("1");
  const [bolum, setBolum] = useState("1");
  const [bolumAd, setBolumAd] = useState("");
  const [varlik, setVarlik] = useState(null); // seçilen video
  const [asama, setAsama] = useState("hazir"); // hazir | gonderiliyor | yuklendi
  const [ilerleme, setIlerleme] = useState(0);
  const [hata, setHata] = useState(null);

  useEffect(() => {
    if (user) benimBasliklarim(user.id).then(setBasliklar).catch(() => {});
  }, [user?.id]);

  const alan = { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.line, borderRadius: 10, color: t.text, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10, marginTop: 6 };
  const etiketStil = { color: t.dim, fontSize: 13, marginTop: 18, fontWeight: "600" };

  if (!user) {
    return (
      <View style={[s.kap, { alignItems: "center", justifyContent: "center", padding: 32, paddingBottom: 120 }]}>
        <Ionicons name="cloud-upload-outline" size={46} color={t.dim} />
        <Text style={[s.modalBaslik, { marginTop: 16 }]}>{y.baslik}</Text>
        <Text style={[s.dim, { textAlign: "center", marginTop: 8 }]}>{y.girisGerek}</Text>
        <TouchableOpacity style={[s.izleDugme, { marginTop: 20 }]} onPress={girisAc}>
          <Gradyan /><Text style={s.izleYazi}>{d.girisYap}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const seciliBaslik = basliklar.find((b) => b.id === hedef);
  const dizi = hedef === "yeni" ? kind === "dizi" : seciliBaslik?.kind === "dizi";

  async function videoSec() {
    try {
      const izin = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!izin.granted) return;
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, quality: 1 });
      if (!r.canceled && r.assets?.[0]) { setVarlik(r.assets[0]); setHata(null); }
    } catch { /* iptal / izin yok */ }
  }

  async function gonder() {
    if (asama === "gonderiliyor") return;
    if (!varlik || (hedef === "yeni" && !ad.trim())) { setHata(y.hata); return; }
    setHata(null); setAsama("gonderiliyor"); setIlerleme(0);
    try {
      let titleId = hedef;
      if (hedef === "yeni") {
        titleId = await baslikOlustur({
          creator_id: user.id, name: ad.trim(), kind,
          genre: tur.trim() || null, year: Number(yil) || null,
          description: aciklama.trim() || null,
          haftalik: kind === "dizi" ? haftalik : false, status: "draft",
        });
      }
      const yanit = await createUpload({
        title_id: titleId, name: bolumAd.trim() || null,
        season: dizi && icerikTipi === "ana" ? Number(sezon) : null,
        episode: dizi && icerikTipi === "ana" ? Number(bolum) : null,
        icerik_tipi: icerikTipi,
      });
      await new Promise((coz, reddet) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", yanit.uploadURL);
        xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setIlerleme(Math.round((ev.loaded / ev.total) * 100)); };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? coz() : reddet(new Error("cf")));
        xhr.onerror = () => reddet(new Error("net"));
        const form = new FormData();
        form.append("file", { uri: varlik.uri, name: varlik.fileName || "video.mp4", type: varlik.mimeType || "video/mp4" });
        xhr.send(form);
      });
      setAsama("yuklendi");
    } catch {
      setHata(y.hata); setAsama("hazir");
    }
  }

  if (asama === "yuklendi") {
    return (
      <View style={[s.kap, { alignItems: "center", justifyContent: "center", padding: 32, paddingBottom: 120 }]}>
        <Text style={{ fontSize: 44 }}>✅</Text>
        <Text style={[s.modalBaslik, { marginTop: 12 }]}>{y.tamam}</Text>
        <Text style={[s.dim, { textAlign: "center", marginTop: 8, lineHeight: 20 }]}>{y.tamamAlt}</Text>
        <TouchableOpacity style={[s.listemDugme, { marginTop: 20 }]} onPress={() => { setAsama("hazir"); setVarlik(null); setIlerleme(0); }}>
          <Text style={{ color: t.text, fontWeight: "600", fontSize: 14 }}>{y.yeniden}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={s.kap} contentContainerStyle={{ padding: 16, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
      <Text style={s.oynaticiAd}>{y.baslik}</Text>
      <Text style={[s.dim, { fontSize: 14, marginTop: 4 }]}>{y.altyazi}</Text>

      {/* Hedef: yeni içerik ya da mevcut başlığa bölüm ekle */}
      {basliklar.length > 0 && (
        <>
          <Text style={etiketStil}>{y.mevcut}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
            <Cip etiket={y.yeni} secili={hedef === "yeni"} sec={() => setHedef("yeni")} />
            {basliklar.map((b) => (
              <Cip key={b.id} etiket={b.name} secili={hedef === b.id} sec={() => setHedef(b.id)} />
            ))}
          </View>
        </>
      )}

      {hedef === "yeni" && (
        <>
          {/* Kategori */}
          <Text style={etiketStil}>{y.kategori}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
            <Cip etiket={d.kisaFilm} secili={kind === "kisa_film"} sec={() => setKind("kisa_film")} />
            <Cip etiket={d.uzunFilm} secili={kind === "uzun_film"} sec={() => setKind("uzun_film")} />
            <Cip etiket={d.dizi} secili={kind === "dizi"} sec={() => setKind("dizi")} />
          </View>

          <Text style={etiketStil}>{y.ad}</Text>
          <TextInput value={ad} onChangeText={setAd} style={alan} placeholder={y.ad} placeholderTextColor={t.dim} />

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 2 }}>
              <Text style={etiketStil}>{y.tur}</Text>
              <TextInput value={tur} onChangeText={setTur} style={alan} placeholder={y.tur} placeholderTextColor={t.dim} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={etiketStil}>{y.yil}</Text>
              <TextInput value={yil} onChangeText={setYil} style={alan} keyboardType="number-pad" maxLength={4} />
            </View>
          </View>

          <Text style={etiketStil}>{y.aciklamaEt}</Text>
          <TextInput value={aciklama} onChangeText={setAciklama} style={[alan, { minHeight: 70, textAlignVertical: "top" }]} multiline placeholder={y.aciklamaEt} placeholderTextColor={t.dim} />

          {kind === "dizi" && (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
              <Text style={{ color: t.text, fontSize: 14, flex: 1 }}>{y.haftalik}</Text>
              <Switch value={haftalik} onValueChange={setHaftalik} trackColor={{ true: t.accent, false: t.line }} thumbColor="#0A0A0B" />
            </View>
          )}
        </>
      )}

      {/* İçerik türü: ana / yapım (BTS) */}
      <Text style={etiketStil}>{y.icerik}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
        <Cip etiket={y.ana} secili={icerikTipi === "ana"} sec={() => setIcerikTipi("ana")} />
        <Cip etiket={y.yapim} secili={icerikTipi === "yapim"} sec={() => setIcerikTipi("yapim")} />
      </View>

      {/* Dizi + ana bölüm → sezon/bölüm */}
      {dizi && icerikTipi === "ana" && (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={etiketStil}>{y.sezon}</Text>
            <TextInput value={sezon} onChangeText={setSezon} style={alan} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={etiketStil}>{y.bolum}</Text>
            <TextInput value={bolum} onChangeText={setBolum} style={alan} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 2 }}>
            <Text style={etiketStil}>{y.bolumAd}</Text>
            <TextInput value={bolumAd} onChangeText={setBolumAd} style={alan} placeholder={y.bolumAd} placeholderTextColor={t.dim} />
          </View>
        </View>
      )}

      {/* Video seç */}
      <TouchableOpacity onPress={videoSec} style={{ marginTop: 20, borderWidth: 1, borderColor: varlik ? t.accent : t.line, borderStyle: "dashed", borderRadius: 12, padding: 18, alignItems: "center", backgroundColor: t.surface2 }}>
        <Ionicons name={varlik ? "checkmark-circle" : "videocam-outline"} size={28} color={varlik ? t.accent : t.dim} />
        <Text style={{ color: varlik ? t.accent : t.text, fontWeight: "600", fontSize: 14, marginTop: 8 }}>
          {varlik ? y.videoSecili : y.videoSec}
        </Text>
        {varlik?.fileName ? <Text style={[s.dim, { fontSize: 12, marginTop: 3 }]} numberOfLines={1}>{varlik.fileName}</Text> : null}
      </TouchableOpacity>

      {hata ? <Text style={{ color: t.danger, fontSize: 13, marginTop: 12 }}>{hata}</Text> : null}

      {asama === "gonderiliyor" ? (
        <View style={{ marginTop: 18 }}>
          <View style={{ height: 6, backgroundColor: t.surface2, borderRadius: 3, overflow: "hidden" }}>
            <View style={{ width: `${ilerleme}%`, height: "100%", backgroundColor: t.accent }} />
          </View>
          <Text style={[s.dim, { fontSize: 13, marginTop: 8 }]}>{y.yukleniyor} {ilerleme}%</Text>
        </View>
      ) : (
        <TouchableOpacity onPress={gonder} disabled={!varlik} style={[s.izleDugme, { marginTop: 20, alignItems: "center", opacity: varlik ? 1 : 0.5 }]}>
          <Gradyan />
          <Text style={s.izleYazi}>{y.gonder}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

// ————— Mobil Yarışma: aktif yarışma + üretici katılımı (kendi başlığını sok) + oylama —————
// Backend web ile AYNI (contests / contest_entries / contest_votes). Üretici yayınlanmış
// içeriklerinden birini seçip yarışmaya sokar (RLS: creator + published). İzleyici tek oy.
function MobilYarisma({ d, user, girisAc, geri }) {
  const yr = d.yarisma;
  const [veri, setVeri] = useState(null); // null: yükleniyor
  const [secili, setSecili] = useState(null); // katılım için seçilen başlık
  const [mesgul, setMesgul] = useState(false);

  const yukle = () =>
    getYarismaVerisi(user?.id)
      .then(setVeri)
      .catch(() => setVeri({ yarisma: null, girisler: [], oylar: new Map(), benimOyum: null, basliklarim: [] }));
  useEffect(() => { setVeri(null); yukle(); }, [user?.id]);

  if (veri === null) return <Durum d={d} yukleniyor geri={geri} />;
  const { yarisma, girisler, oylar, benimOyum, basliklarim } = veri;
  if (!yarisma) return <Durum d={d} mesaj={yr.yok} geri={geri} />;

  const kalanGun = yarisma.ends_at ? Math.max(0, Math.ceil((new Date(yarisma.ends_at) - Date.now()) / 86400000)) : null;
  const bitti = yarisma.ends_at ? new Date(yarisma.ends_at) <= Date.now() : false;
  const sirali = [...girisler].sort((a, b) => (oylar.get(b.id) || 0) - (oylar.get(a.id) || 0));
  const katilabilir = basliklarim.filter((b) => !girisler.some((g) => g.id === b.id));

  async function oyla(titleId) {
    if (!user) return girisAc();
    if (mesgul) return;
    setMesgul(true);
    await voteContest(yarisma.id, user.id, titleId);
    await yukle();
    setMesgul(false);
  }
  async function katil() {
    if (!user) return girisAc();
    if (!secili || mesgul) return;
    setMesgul(true);
    const { error } = await enterContest(yarisma.id, secili);
    if (!error) setSecili(null);
    await yukle();
    setMesgul(false);
  }

  return (
    <ScrollView style={s.kap} contentContainerStyle={{ padding: 16, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
      <GeriButon d={d} geri={geri} />
      <Text style={[s.oynaticiAd, { marginTop: 12 }]}>{yarisma.name}</Text>
      {!!yarisma.description && <Text style={[s.dim, { marginTop: 6, lineHeight: 20 }]}>{yarisma.description}</Text>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
        {kalanGun !== null && !bitti && <Text style={s.dim}>{yr.kalan(kalanGun)}</Text>}
        {bitti && <Text style={{ color: t.accent, fontWeight: "700" }}>{yr.bitti}</Text>}
        <Text style={s.dim}>· {yr.katilimci(girisler.length)}</Text>
      </View>

      {/* Üretici katılımı: kendi yayınlanmış içeriklerinden birini seç → sok */}
      {user && !bitti && katilabilir.length > 0 && (
        <View style={{ marginTop: 18, padding: 14, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 12 }}>
          <Text style={{ color: t.text, fontWeight: "700", marginBottom: 4 }}>{yr.katil}</Text>
          <Text style={[s.dim, { fontSize: 12, marginBottom: 8 }]}>{yr.sec}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {katilabilir.map((b) => (
              <Cip key={b.id} etiket={b.name} secili={secili === b.id} sec={() => setSecili(b.id)} />
            ))}
          </View>
          <TouchableOpacity onPress={katil} disabled={!secili || mesgul} style={[s.izleDugme, { alignSelf: "flex-start", marginTop: 12, opacity: secili && !mesgul ? 1 : 0.5 }]}>
            <Gradyan />
            <Text style={s.izleYazi}>{yr.katil}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sıralama + oylama */}
      <View style={{ marginTop: 20 }}>
        {sirali.length === 0 ? (
          <Text style={[s.dim, { textAlign: "center", paddingVertical: 24 }]}>{yr.girisYok}</Text>
        ) : (
          sirali.map((b, i) => {
            const oySayisi = oylar.get(b.id) || 0;
            const benimki = benimOyum === b.id;
            return (
              <View key={String(b.id)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.line }}>
                <Text style={{ color: i === 0 ? t.accent : t.dim, width: 22, fontWeight: "800", fontSize: 15 }}>{i + 1}</Text>
                <View style={{ width: 82, aspectRatio: 16 / 9, borderRadius: 8, overflow: "hidden", backgroundColor: t.surface2 }}>
                  <Kapak baslik={b} harf={22} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: t.text, fontWeight: "600" }} numberOfLines={1}>{b.name}</Text>
                  <Text style={s.dim} numberOfLines={1}>
                    {yr.oy(oySayisi)}{i === 0 && oySayisi > 0 ? ` · ${yr.onde}` : ""}
                  </Text>
                </View>
                {!bitti && (
                  <TouchableOpacity onPress={() => oyla(b.id)} disabled={mesgul} style={benimki ? [s.izleDugme, { paddingHorizontal: 14, minWidth: 0 }] : [s.listemDugme]}>
                    {benimki && <Gradyan />}
                    <Text style={benimki ? s.izleYazi : { color: t.text, fontWeight: "600", fontSize: 13 }}>{benimki ? yr.oyun : yr.oyVer}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

// ————— Mobil Stüdyo: üreticinin içerik + izlenme özeti (salt-görüntüleme) —————
// Veri: creator_stats() RPC (web Studio ile aynı). Alt yazı/hakediş web'de; mobil özet gösterir.
const DURUM_RENK = { uploading: "#8C8F88", processing: "#8C8F88", in_review: "#ECEEE9", approved: "#FF4DBD", rejected: "#E2574C" };
function MobilStudyo({ d, user, girisAc }) {
  const st = d.studyo;
  const [satirlar, setSatirlar] = useState(null); // null: yükleniyor
  useEffect(() => {
    if (!user) { setSatirlar([]); return; }
    let aktif = true;
    getCreatorStats().then((v) => aktif && setSatirlar(v)).catch(() => aktif && setSatirlar([]));
    return () => { aktif = false; };
  }, [user?.id]);

  if (!user) {
    return (
      <View style={[s.kap, { alignItems: "center", justifyContent: "center", padding: 32, paddingBottom: 120 }]}>
        <Ionicons name="film-outline" size={46} color={t.dim} />
        <Text style={[s.modalBaslik, { marginTop: 16 }]}>{st.baslik}</Text>
        <Text style={[s.dim, { textAlign: "center", marginTop: 8 }]}>{st.girisGerek}</Text>
        <TouchableOpacity style={[s.izleDugme, { marginTop: 20 }]} onPress={girisAc}>
          <Gradyan /><Text style={s.izleYazi}>{d.girisYap}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (satirlar === null) return <Durum d={d} yukleniyor />;

  const toplamIzlenme = satirlar.reduce((a, r) => a + Number(r.izlenme || 0), 0);
  const toplamSaat = satirlar.reduce((a, r) => a + Number(r.toplam_saniye || 0), 0) / 3600;
  const yayinda = satirlar.filter((r) => r.durum === "approved").length;
  const OzetKart = ({ n, e }) => (
    <View style={{ flex: 1, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 14, alignItems: "center" }}>
      <Text style={{ color: t.text, fontSize: 20, fontWeight: "800" }}>{n}</Text>
      <Text style={[s.dim, { fontSize: 11, marginTop: 3, textAlign: "center" }]}>{e}</Text>
    </View>
  );

  return (
    <ScrollView style={s.kap} contentContainerStyle={{ padding: 16, paddingBottom: 130 }}>
      <Text style={s.oynaticiAd}>{st.baslik}</Text>
      <Text style={[s.dim, { fontSize: 14, marginTop: 4 }]}>{st.altyazi}</Text>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
        <OzetKart n={toplamIzlenme} e={st.izlenme} />
        <OzetKart n={toplamSaat.toFixed(1)} e={st.saat} />
        <OzetKart n={yayinda} e={st.yayinda} />
      </View>

      <View style={{ marginTop: 20 }}>
        {satirlar.length === 0 ? (
          <Text style={[s.dim, { textAlign: "center", paddingVertical: 24 }]}>{st.bos}</Text>
        ) : (
          satirlar.map((r) => (
            <View key={String(r.bolum_id)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.line }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: t.text, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>
                  {r.baslik_ad}
                  {r.sezon ? ` · ${d.seb(r.sezon, r.bolum)}` : ""}
                  {r.bolum_ad ? ` — ${r.bolum_ad}` : ""}
                </Text>
                <Text style={[s.dim, { fontSize: 12, marginTop: 2 }]}>{r.izlenme} {st.izlenme}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: DURUM_RENK[r.durum] || t.dim }} />
                <Text style={{ color: DURUM_RENK[r.durum] || t.dim, fontSize: 12, fontWeight: "600" }}>{st.durum[r.durum] ?? r.durum}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

// ————— STEP 1: ücretsiz oynatma doğrulaması (geçici) —————
// Cloudflare Stream'e para harcamadan Watch→oynatıcı→gerçek oynatma zincirini kanıtlamak
// için, cf_uid YOKKEN (demo seed) herkese açık bir test HLS akışı oynatılır. iOS WebView
// <video>'yu native HLS ile oynatır (hls.js gerekmez). cf_uid gerçek UID olunca (Step 2)
// otomatik CF iframe'e döner — bu blok o zaman kaldırılabilir. CF_CODE'a DOKUNMAZ.
const TEST_HLS = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
const testOynaticiHtml = (url) =>
  `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">` +
  `<style>html,body{margin:0;background:#000;height:100%}video{width:100%;height:100%;object-fit:contain;background:#000}</style></head>` +
  `<body><video src="${url}" controls autoplay muted playsinline webkit-playsinline></video></body></html>`;

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

// Katalog client-side önbelleği — web'deki 60 sn TTL ile aynı: sekme değişiminde
// (home↔discover) veya remount'ta gereksiz yeniden fetch'i önler. Modül seviyesinde
// tutulur ki App yeniden mount olsa da (nadir) süre içinde tazeliğini korusun.
let katalogOnbellek = { veri: null, zaman: 0 };
const KATALOG_TTL_MS = 60_000;
async function getCatalogOnbellekli() {
  const simdi = Date.now();
  if (katalogOnbellek.veri && simdi - katalogOnbellek.zaman < KATALOG_TTL_MS) {
    return katalogOnbellek.veri;
  }
  const veri = await getCatalog();
  katalogOnbellek = { veri, zaman: Date.now() };
  return veri;
}

export default function App() {
  // gorunum: {tip:"ana"} | {tip:"detay", id} | {tip:"oynat", video, baslik}
  const [gorunum, setGorunum] = useState({ tip: "ana" });
  const [dil, setDil] = useState("en");
  const [ayarlar, setAyarlar] = useState({ altyaziAcik: false, altyaziDil: "" });
  const [girisAcik, setGirisAcik] = useState(false);
  const [ayarlarAcik, setAyarlarAcik] = useState(false);
  const [sifreYenileAcik, setSifreYenileAcik] = useState(false);
  const [sekme, setSekme] = useState("home"); // alt nav: home | discover | upload | studio | profile
  const { user } = useAuth();
  const d = METINLER[dil];

  // Rol (üretici geçidi): Yükle/Stüdyo yalnız creator/admin'e açık; izleyici başvuru görür.
  // (web ile birebir: onaylanmadan yükleme yok.) null = henüz yüklenmedi.
  const [rol, setRol] = useState(null);
  useEffect(() => {
    if (!user) return setRol(null);
    profilGetir(user.id).then((p) => setRol(p?.role ?? "viewer")).catch(() => setRol("viewer"));
  }, [user?.id]);
  const uretici = rol === "creator" || rol === "admin";

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

  // Şifre sıfırlama deep link'i (vaelo://reset-password#...): mobilde detectSessionInUrl
  // kapalı olduğundan token'ı elle yakalayıp recovery oturumu kurar → "yeni şifre" modalı.
  // (Google auth-callback'i openAuthSessionAsync kendi içinde tükettiği için buraya düşmez.)
  useEffect(() => {
    async function eleAl(url) {
      if (!url || !url.includes("reset-password")) return;
      const oldu = await recoveryOturumuKur(url);
      if (oldu) setSifreYenileAcik(true);
    }
    Linking.getInitialURL().then(eleAl).catch(() => {}); // uygulama kapalıyken açılış
    const abone = Linking.addEventListener("url", (e) => eleAl(e.url)); // açıkken
    return () => abone.remove();
  }, []);

  const oynat = (video, baslik) => setGorunum({ tip: "oynat", video, baslik });
  // Üretici profil sayfası (Instagram/TikTok tarzı: bio + ürettiği içerikler)
  const ureticiAc = (creatorId) => creatorId && setGorunum({ tip: "uretici", id: creatorId });

  return (
    <SafeAreaProvider>
    <SafeAreaView style={s.kap}>
      <StatusBar style="light" />
      {gorunum.tip === "ana" && (
        <>
          {(sekme === "home" || sekme === "discover") && (
            <Ana
              d={d}
              user={user}
              girisAc={() => setGirisAcik(true)}
              ayarlarAc={() => setAyarlarAcik(true)}
              tabloAc={() => setSekme("sanat")}
              yarismaAc={() => setGorunum({ tip: "yarisma" })}
              oynat={oynat}
              ac={(id) => setGorunum({ tip: "detay", id })}
              aramaOdak={sekme === "discover"}
              festivalGit={(hedef) => {
                // sanat → Sanat sekmesi; film → giriş yoksa çağır, varsa Upload sekmesi
                if (hedef === "art") return setSekme("sanat");
                if (!user) return setGirisAcik(true);
                setSekme("upload");
              }}
            />
          )}
          {sekme === "upload" && (uretici ? (
            <MobilYukle d={d} user={user} girisAc={() => setGirisAcik(true)} />
          ) : (
            <MobilBasvuru d={d} user={user} girisAc={() => setGirisAcik(true)} />
          ))}
          {sekme === "sanat" && (
            <Tablo d={d} user={user} girisAc={() => setGirisAcik(true)} sekmeModu />
          )}
          {sekme === "studio" && (uretici ? (
            <MobilStudyo d={d} user={user} girisAc={() => setGirisAcik(true)} />
          ) : (
            <MobilBasvuru d={d} user={user} girisAc={() => setGirisAcik(true)} />
          ))}
          {sekme === "profile" && (
            <ProfilEkrani
              d={d}
              user={user}
              dil={dil}
              setDil={setDil}
              ayarlar={ayarlar}
              setAyarlar={setAyarlar}
              girisAc={() => setGirisAcik(true)}
            />
          )}
          <AltNav d={d} sekme={sekme} setSekme={setSekme} />
        </>
      )}
      {gorunum.tip === "tablo" && (
        <KaydirGeri onGeri={() => setGorunum({ tip: "ana" })}>
          <Tablo
            d={d}
            user={user}
            girisAc={() => setGirisAcik(true)}
            geri={() => setGorunum({ tip: "ana" })}
          />
        </KaydirGeri>
      )}
      {gorunum.tip === "detay" && (
        <KaydirGeri onGeri={() => setGorunum({ tip: "ana" })}>
          <Detay
            d={d}
            id={gorunum.id}
            user={user}
            girisAc={() => setGirisAcik(true)}
            oynat={oynat}
            geri={() => setGorunum({ tip: "ana" })}
          />
        </KaydirGeri>
      )}
      {gorunum.tip === "oynat" && (
        <KaydirGeri onGeri={() => setGorunum({ tip: "ana" })}>
          <Oynatici
            d={d}
            dil={dil}
            video={gorunum.video}
            baslik={gorunum.baslik}
            user={user}
            altyaziDil={ayarlar.altyaziAcik ? ayarlar.altyaziDil || dil : ""}
            oynat={oynat}
            girisAc={() => setGirisAcik(true)}
            ureticiAc={ureticiAc}
            geri={() => setGorunum({ tip: "ana" })}
          />
        </KaydirGeri>
      )}
      {gorunum.tip === "uretici" && (
        <KaydirGeri onGeri={() => setGorunum({ tip: "ana" })}>
          <UreticiProfili
            d={d}
            id={gorunum.id}
            ac={(id) => setGorunum({ tip: "detay", id })}
            geri={() => setGorunum({ tip: "ana" })}
          />
        </KaydirGeri>
      )}
      {gorunum.tip === "yarisma" && (
        <KaydirGeri onGeri={() => setGorunum({ tip: "ana" })}>
          <MobilYarisma
            d={d}
            user={user}
            girisAc={() => setGirisAcik(true)}
            geri={() => setGorunum({ tip: "ana" })}
          />
        </KaydirGeri>
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
      {sifreYenileAcik && <SifreYenileModal d={d} kapat={() => setSifreYenileAcik(false)} />}
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ————— Yeni şifre belirle modalı (şifre sıfırlama bağlantısından dönünce) —————
function SifreYenileModal({ d, kapat }) {
  const [sifre, setSifre] = useState("");
  const [hata, setHata] = useState(null);
  const [mesaj, setMesaj] = useState(null);
  const [bekliyor, setBekliyor] = useState(false);

  async function gonder() {
    setHata(null);
    setBekliyor(true);
    const { error } = await sifreGuncelle(sifre);
    setBekliyor(false);
    if (error) return setHata(error.message);
    dokunBasari();
    setMesaj(d.sifreGuncellendi);
    setTimeout(kapat, 1500); // kullanıcı mesajı görsün; artık yeni şifreyle girmiş durumda
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={kapat}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={s.modalArka}
      >
        <View style={s.modalKart}>
          <Text style={s.modalBaslik}>{d.yeniSifreBaslik}</Text>
          <TextInput
            style={[s.modalAlan, { marginTop: 16 }]}
            placeholder={d.yeniSifre}
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
            <Gradyan />
            <Text style={s.izleYazi}>{bekliyor ? d.bekle : d.sifreKaydet}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
            <Gradyan />
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
  const [sifirla, setSifirla] = useState(false); // şifre sıfırlama modu
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
    // Şifre sıfırlama: yalnız e-posta; Supabase bağlantı e-postası yollar
    if (sifirla) {
      const { error } = await sifreSifirla(email);
      setBekliyor(false);
      if (error) return setHata(error.message);
      return setMesaj(d.sifirlaGitti);
    }
    const { error } = kayit ? await signUp(email, sifre, ad) : await signIn(email, sifre);
    setBekliyor(false);
    if (error) {
      // Google ile açılmış (şifresiz) hesapta e-posta+şifre denemesi de bu jenerik hatayı
      // verir — daha açıklayıcı mesaja çevir (Supabase iki durumu güvenlik için ayırt etmez).
      if (!kayit && /invalid login/i.test(error.message)) return setHata(d.girisGecersiz);
      return setHata(error.message);
    }
    if (kayit) {
      dokunBasari();
      setMesaj(d.kayitAlindi);
    } else {
      dokunBasari();
      kapat(); // giriş başarılı → onAuthStateChange kullanıcıyı günceller
    }
  }

  async function googleGiris() {
    setHata(null);
    setMesaj(null);
    setBekliyor(true);
    const { error, iptal } = await signInWithGoogle();
    setBekliyor(false);
    if (iptal) return; // kullanıcı tarayıcıyı kapattı
    if (error) return setHata(d.googleHata(error.message));
    kapat(); // başarılı → onAuthStateChange kullanıcıyı günceller
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={kapat}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={s.modalArka}
      >
        <View style={s.modalKart}>
          <Text style={s.modalBaslik}>{sifirla ? d.sifirlaBaslik : kayit ? d.kayitBaslik : d.girisBaslik}</Text>
          <Text style={[s.dim, { marginBottom: 16 }]}>{sifirla ? d.sifirlaAlt : d.girisAlt}</Text>

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
          {!sifirla && (
            <TextInput
              style={s.modalAlan}
              placeholder={d.sifre}
              placeholderTextColor={t.dim}
              secureTextEntry
              value={sifre}
              onChangeText={setSifre}
            />
          )}

          {hata && <Text style={{ color: t.danger, fontSize: 13, marginBottom: 10 }}>{hata}</Text>}
          {mesaj && <Text style={{ color: t.text, fontSize: 13, marginBottom: 10 }}>{mesaj}</Text>}

          <TouchableOpacity
            style={[s.izleDugme, { alignSelf: "stretch", alignItems: "center", opacity: bekliyor ? 0.6 : 1 }]}
            onPress={gonder}
            disabled={bekliyor}
          >
            <Gradyan />
            <Text style={s.izleYazi}>
              {bekliyor ? d.bekle : sifirla ? d.sifirlaGonder : kayit ? d.kayitOl : d.girisYap}
            </Text>
          </TouchableOpacity>

          {/* Şifremi unuttum — yalnız giriş modunda */}
          {!sifirla && !kayit && (
            <TouchableOpacity
              onPress={() => {
                setSifirla(true);
                setHata(null);
                setMesaj(null);
              }}
              style={{ marginTop: 12, alignItems: "center" }}
            >
              <Text style={[s.dim, { textDecorationLine: "underline" }]}>{d.sifremiUnuttum}</Text>
            </TouchableOpacity>
          )}

          {/* veya + Google ile devam et — sıfırlama modunda gizli */}
          {!sifirla && (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 16 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
                <Text style={{ color: t.dim, fontSize: 12, marginHorizontal: 12 }}>{d.veya}</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
              </View>
              <TouchableOpacity
                onPress={googleGiris}
                disabled={bekliyor}
                style={{
                  alignSelf: "stretch",
                  alignItems: "center",
                  paddingVertical: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: t.line,
                  backgroundColor: t.surface2,
                  opacity: bekliyor ? 0.6 : 1,
                }}
              >
                <Text style={{ color: t.text, fontWeight: "600", fontSize: 14 }}>{d.googleIle}</Text>
              </TouchableOpacity>
            </>
          )}

          {sifirla ? (
            <TouchableOpacity
              onPress={() => {
                setSifirla(false);
                setHata(null);
                setMesaj(null);
              }}
              style={{ marginTop: 14, alignItems: "center" }}
            >
              <Text style={[s.dim, { textDecorationLine: "underline" }]}>{d.giriseDon}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setKayit(!kayit)} style={{ marginTop: 14, alignItems: "center" }}>
              <Text style={[s.dim, { textDecorationLine: "underline" }]}>{d.hesapGecis(kayit)}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={kapat} style={{ marginTop: 14, alignItems: "center" }}>
            <Text style={s.dim}>✕</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ————— İskelet yükleme: katalog gelene kadar nabız animasyonlu placeholder —————
// Basit opaklık nabzı (700ms git-gel, useNativeDriver) — spinner yerine "içerik geliyor"
// hissi verir; web'deki skeleton ile aynı amaç.
function NabizKutu({ style }) {
  const anim = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const dongu = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    );
    dongu.start();
    return () => dongu.stop();
  }, []);
  return (
    <Animated.View
      style={[{ backgroundColor: t.surface2, borderRadius: 8 }, style, { opacity: anim }]}
    />
  );
}
function AnaIskelet() {
  return (
    <View style={s.kap}>
      <View style={[s.ustSatir, { paddingTop: 12 }]}>
        <NabizKutu style={{ width: 77, height: 24, borderRadius: 4 }} />
        <NabizKutu style={{ width: 96, height: 28, borderRadius: 14 }} />
      </View>
      <NabizKutu style={{ height: 40, marginHorizontal: 16, marginTop: 16 }} />
      <NabizKutu style={{ width: "100%", height: 210, marginTop: 20, borderRadius: 0 }} />
      <View style={{ paddingHorizontal: 16, gap: 8, marginTop: 12 }}>
        <NabizKutu style={{ width: "70%", height: 22 }} />
        <NabizKutu style={{ width: "40%", height: 14 }} />
      </View>
      {[1, 2, 3].map((i) => (
        <View key={i} style={{ paddingHorizontal: 16, marginTop: 28 }}>
          <NabizKutu style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 10 }} />
          <NabizKutu style={{ width: "60%", height: 18, marginTop: 10 }} />
          <NabizKutu style={{ width: "35%", height: 12, marginTop: 6 }} />
        </View>
      ))}
    </View>
  );
}

// ————— Video 1–10 halk oylaması (mobil) — aggregate + optimistik oy —————
function MobilPuan({ video, user, girisAc, d }) {
  const [ozet, setOzet] = useState({ ortalama: null, oySayisi: 0, benim: null });
  useEffect(() => {
    getVideoPuan(video.id, user?.id ?? null).then(setOzet).catch(() => {});
  }, [video.id, user?.id]);

  function oyla(p) {
    if (!user) return girisAc();
    setOzet((o) => {
      const yeniSayi = o.benim == null ? o.oySayisi + 1 : o.oySayisi;
      const toplam = (o.ortalama ?? 0) * o.oySayisi - (o.benim ?? 0) + p;
      const yeniOrt = yeniSayi > 0 ? Math.round((toplam / yeniSayi) * 10) / 10 : p;
      return { ortalama: yeniOrt, oySayisi: yeniSayi, benim: p };
    });
    puanVer(video.id, user.id, p).catch(() => {
      getVideoPuan(video.id, user.id).then(setOzet).catch(() => {});
    });
  }

  const pp = d.puanlama;
  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
        <Text style={{ color: t.text, fontSize: 15, fontWeight: "700" }}>{pp.baslik}</Text>
        {ozet.ortalama != null ? (
          <Text style={{ color: t.text, fontSize: 14 }}>
            <Text style={{ fontWeight: "700" }}>{ozet.ortalama.toFixed(1)}</Text>
            <Text style={{ color: t.dim }}> · {pp.oy(ozet.oySayisi)}</Text>
          </Text>
        ) : (
          <Text style={{ color: t.dim, fontSize: 13 }}>{pp.yok}</Text>
        )}
        {ozet.benim != null && (
          <Text style={{ color: t.dim, fontSize: 12 }}>
            {pp.senin}: {ozet.benim}
          </Text>
        )}
      </View>
      {/* 5+5 iki satır: her buton flex:1, sabit kısa yükseklik → kompakt, taşmaz */}
      <View style={{ gap: 6 }}>
        {[[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]].map((satir, si) => (
          <View key={si} style={{ flexDirection: "row", gap: 6 }}>
            {satir.map((p) => {
              const secili = ozet.benim === p;
              return (
                <TouchableOpacity
                  key={p}
                  onPress={() => oyla(p)}
                  activeOpacity={0.8}
                  style={{
                    flex: 1,
                    height: 40,
                    borderRadius: 8,
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    borderWidth: 1,
                    borderColor: secili ? t.accent : t.line,
                  }}
                >
                  {secili && <Gradyan />}
                  <Text style={{ color: secili ? "#0A0A0B" : t.text, fontWeight: "700", fontSize: 14 }}>{p}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

// ————— Festival (toplama fazı) landing'i: promo banner + iki AYRI CTA (film / sanat) —————
function MobilFestivalKart({ baslik, alt, cta, vurgulu, bas }) {
  return (
    <View style={{ borderWidth: 1, borderColor: t.line, borderRadius: 14, padding: 18, marginTop: 12, backgroundColor: t.surface }}>
      <Text style={{ color: t.text, fontSize: 17, fontWeight: "700" }}>{baslik}</Text>
      <Text style={{ color: t.dim, fontSize: 13, marginTop: 6, lineHeight: 19 }}>{alt}</Text>
      <TouchableOpacity
        onPress={bas}
        activeOpacity={0.85}
        style={[
          { marginTop: 14, alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10, overflow: "hidden" },
          vurgulu ? {} : { borderWidth: 1, borderColor: t.line },
        ]}
      >
        {vurgulu && <Gradyan />}
        <Text style={{ color: vurgulu ? "#0A0A0B" : t.text, fontWeight: "700", fontSize: 14 }}>{cta}</Text>
      </TouchableOpacity>
    </View>
  );
}
function MobilFestival({ d, banner, git, tabloAc, yarismaAc, ayarlarAc, user, girisAc, buHafta = [], ac, arama, setArama, aramaRef, sonuclar }) {
  const f = d.festival;
  const link = banner?.link_url && /^https?:\/\//i.test(banner.link_url) ? banner.link_url : null;
  const aramaAktif = sonuclar !== null; // ≥2 karakter → arama sonuçları (festival landing yerine)
  return (
    <ScrollView style={s.kap} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
      {/* Header (ana ekranla tutarlı) */}
      <View style={s.ustSatir}>
        <ExpoImage
          source={require("./assets/vaelo_horizontal_lockup_transparent.png")}
          style={{ height: 24, width: 77 }}
          contentFit="contain"
          accessibilityLabel="Vaelo"
        />
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TouchableOpacity style={s.dilDugme} onPress={ayarlarAc}>
            <Text style={[s.dilYazi, { fontSize: 15 }]}>⚙</Text>
          </TouchableOpacity>
          {/* Header'da yalnız GİRİŞ; çıkış artık sadece Profil sekmesinde */}
          {!user && (
            <TouchableOpacity style={s.dilDugme} onPress={girisAc}>
              <Text style={s.dilYazi}>{d.girisYap}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Arama — festival modunda da çalışır (önceden yalnız netflix modunda vardı). Kutu koşuldan
          ÖNCE sabit render edilir → 2-karakter eşiğini geçerken TextInput remount olmaz, focus/klavye korunur. */}
      {setArama && (
        <TextInput
          ref={aramaRef}
          style={s.arama}
          placeholder={d.ara}
          placeholderTextColor={t.dim}
          value={arama}
          onChangeText={setArama}
        />
      )}

      {aramaAktif ? (
        // Arama sonuçları — netflix moduyla aynı SonucSatiri; festival landing gizlenir
        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          <Text style={s.rafBaslik}>{d.sonuclar}</Text>
          {sonuclar.length === 0 && <Text style={s.dim}>{d.sonucYok}</Text>}
          {sonuclar.map((b) => (
            <SonucSatiri key={String(b.id)} d={d} baslik={b} ac={ac} />
          ))}
        </View>
      ) : (
        <>
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            {banner && (
              <TouchableOpacity
                disabled={!link}
                onPress={() => link && Linking.openURL(link)}
                activeOpacity={link ? 0.85 : 1}
                style={{ borderWidth: 1, borderColor: t.line, borderRadius: 14, overflow: "hidden", marginBottom: 20, backgroundColor: t.surface }}
              >
                {banner.image_url ? (
                  <ExpoImage source={{ uri: banner.image_url }} style={{ width: "100%", height: 150 }} contentFit="cover" />
                ) : null}
                <View style={{ padding: 14 }}>
                  <Text style={{ color: t.text, fontSize: 16, fontWeight: "700" }}>{banner.title}</Text>
                  {banner.body ? <Text style={{ color: t.dim, fontSize: 13, marginTop: 4 }}>{banner.body}</Text> : null}
                </View>
              </TouchableOpacity>
            )}
            <Text style={{ color: t.text, fontSize: 26, fontWeight: "800", lineHeight: 30 }}>{f.baslik}</Text>
            <Text style={{ color: t.dim, fontSize: 15, marginTop: 10, lineHeight: 21 }}>{f.alt}</Text>
            <MobilFestivalKart baslik={f.filmBaslik} alt={f.filmAlt} cta={f.filmCta} vurgulu bas={() => git("film")} />
            <MobilFestivalKart baslik={f.artBaslik} alt={f.artAlt} cta={f.artCta} bas={() => git("art")} />
          </View>

          {/* "Bu Hafta Yeni" — festival penceresinde de taze bölümler (kullanıcı isteği) */}
          {buHafta.length > 0 && ac && (
            <View style={{ marginTop: 28 }}>
              <YatayRaf
                d={d}
                ad={d.buHaftaYeni}
                ogeler={buHafta.map((b) => ({ baslik: b, bas: () => ac(b.id) }))}
              />
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

// ————— Ana: hero + açıklamalı dikey akış + akıllı arama —————
function Ana({ d, user, girisAc, ayarlarAc, tabloAc, yarismaAc, oynat, ac, aramaOdak, festivalGit }) {
  const aramaRef = useRef(null);
  useEffect(() => {
    if (aramaOdak) aramaRef.current?.focus();
  }, [aramaOdak]);
  // Platform modu + aktif promo banner (festival landing için)
  const [mod, setMod] = useState(null);
  const [banner, setBanner] = useState(null);
  useEffect(() => {
    getPlatformMode().then(setMod).catch(() => setMod("netflix"));
    getPromoBanner().then(setBanner).catch(() => {});
  }, []);
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
  const [oneri, setOneri] = useState([]); // "Sana özel" — aktif öneri stratejisi (web ile aynı backend)

  useEffect(() => {
    getCatalogOnbellekli().then(setKatalog).catch((e) => setHata(e.message));
  }, []);

  // "Sana özel" öneri: girişte kişisel, anonimde trending'e düşer (oneri_getir dağıtıcısı)
  useEffect(() => {
    let aktif = true;
    getOneri(user?.id ?? null, 12).then((ids) => aktif && setOneri(ids)).catch(() => {});
    return () => { aktif = false; };
  }, [user?.id]);

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

  // "Bu Hafta Yeni": son 7 günde yeni onaylı bölüm alan başlıklar (festival + netflix ortak)
  const birHaftaOnce = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const enYeniBolum = (b) =>
    Math.max(0, ...(b.videos ?? []).map((v) => (v.published_at ? new Date(v.published_at).getTime() : 0)));
  const buHafta = (katalog ?? [])
    .filter((b) => enYeniBolum(b) >= birHaftaOnce)
    .sort((a, b) => enYeniBolum(b) - enYeniBolum(a))
    .slice(0, 12);

  // Mod yüklenene dek iskelet; festival modunda toplama landing'i (hero+feed yerine)
  if (mod === null) return <AnaIskelet />;
  if (mod === "festival") {
    return (
      <MobilFestival
        d={d}
        banner={banner}
        git={festivalGit}
        tabloAc={tabloAc}
        yarismaAc={yarismaAc}
        ayarlarAc={ayarlarAc}
        user={user}
        girisAc={girisAc}
        buHafta={buHafta}
        ac={ac}
        arama={arama}
        setArama={setArama}
        aramaRef={aramaRef}
        sonuclar={sonuclar}
      />
    );
  }

  if (hata) return <Durum d={d} mesaj={d.sunucuYok(hata)} />;
  if (!katalog) return <AnaIskelet />;

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

  // Marka + dil anahtarı + giriş/çıkış — üç modda da (arama/filtre/varsayılan) aynı üst çubuk
  const ustCubuk = (
    <View style={s.ustSatir}>
      <ExpoImage
        source={require("./assets/vaelo_horizontal_lockup_transparent.png")}
        style={{ height: 24, width: 77 }}
        contentFit="contain"
        accessibilityLabel="Vaelo"
      />
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <TouchableOpacity
          style={s.dilDugme}
          onPress={ayarlarAc}
          accessibilityRole="button"
          accessibilityLabel={d.ayarlar || "Ayarlar"}
        >
          <Text style={[s.dilYazi, { fontSize: 15 }]}>⚙</Text>
        </TouchableOpacity>
        {/* Header'da yalnız GİRİŞ; çıkış artık sadece Profil sekmesinde */}
        {!user && (
          <TouchableOpacity
            style={s.dilDugme}
            onPress={girisAc}
            accessibilityRole="button"
            accessibilityLabel={d.girisYap}
          >
            <Text style={s.dilYazi}>{d.girisYap}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
  const aramaKutusu = (
    <TextInput
      ref={aramaRef}
      style={s.arama}
      placeholder={d.ara}
      placeholderTextColor={t.dim}
      value={arama}
      onChangeText={setArama}
    />
  );
  const heroBlok = hero && (
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
      {(() => {
        // Öneri title_id'lerini katalog nesnelerine çöz (sıra korunur)
        const oneriler = oneri.map((id) => (katalog || []).find((k) => k.id === id)).filter(Boolean);
        return oneriler.length > 0 ? (
          <YatayRaf
            d={d}
            ad={d.sanaOzel}
            ogeler={oneriler.map((b) => ({ baslik: b, bas: () => ac(b.id) }))}
          />
        ) : null;
      })()}
      {buHafta.length > 0 && (
        <YatayRaf
          d={d}
          ad={d.buHaftaYeni}
          ogeler={buHafta.map((b) => ({ baslik: b, bas: () => ac(b.id) }))}
        />
      )}

      {/* Hero */}
      <TouchableOpacity style={s.hero} onPress={() => ac(hero.id)} activeOpacity={0.85}>
        {thumbUrl(hero.videos[0]?.cf_uid) ? (
          <ExpoImage
            source={{ uri: thumbUrl(hero.videos[0].cf_uid) }}
            style={s.heroKapak}
            cachePolicy="memory-disk"
            transition={200}
          />
        ) : (
          <View
            style={[
              s.heroKapak,
              {
                opacity: 1,
                backgroundColor: `hsl(${adTonu(hero.name || "?")}, 44%, 18%)`,
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <Text
              style={{
                fontSize: 120,
                fontWeight: "800",
                color: `hsl(${adTonu(hero.name || "?")}, 58%, 44%)`,
                opacity: 0.4,
              }}
            >
              {(hero.name?.[0] || "?").toUpperCase()}
            </Text>
          </View>
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
            <Gradyan />
            <Text style={s.izleYazi}>{d.izle}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </>
  );

  // Mod 1: akıllı arama sonuçları — sanallaştırılmış liste
  if (sonuclar !== null) {
    return (
      <FlatList
        style={s.kap}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        data={sonuclar}
        keyExtractor={(b) => String(b.id)}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 16 }}>
            <SonucSatiri d={d} baslik={item} ac={ac} />
          </View>
        )}
        ListHeaderComponent={
          <>
            {ustCubuk}
            {aramaKutusu}
            <View style={{ paddingHorizontal: 16 }}>
              <Text style={s.rafBaslik}>{d.sonuclar}</Text>
              {sonuclar.length === 0 && <Text style={s.dim}>{d.sonucYok}</Text>}
            </View>
          </>
        }
        initialNumToRender={8}
        windowSize={7}
      />
    );
  }

  // Mod 2: tip/tür filtresi aktif — sanallaştırılmış ızgara (tek sütun)
  if (suzgecAktif) {
    return (
      <FlatList
        style={s.kap}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        data={suzulmus}
        keyExtractor={(b) => String(b.id)}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 16 }}>
            <AkisKarti d={d} baslik={item} ac={ac} gomulu />
          </View>
        )}
        ListHeaderComponent={
          <>
            {ustCubuk}
            {aramaKutusu}
            {filtreCubugu}
            <View style={{ paddingHorizontal: 16 }}>
              <Text style={s.rafBaslik}>{d.baslikSayisi(suzulmus.length)}</Text>
              {suzulmus.length === 0 && <Text style={s.dim}>{d.sonucYok}</Text>}
            </View>
          </>
        }
        initialNumToRender={6}
        windowSize={7}
      />
    );
  }

  // Mod 3: varsayılan — hero + açıklamalı dikey akış (sanallaştırılmış)
  return (
    <FlatList
      style={s.kap}
      contentContainerStyle={{ paddingBottom: 120 }}
      keyboardShouldPersistTaps="handled"
      data={akis}
      keyExtractor={(b) => String(b.id)}
      renderItem={({ item }) => <AkisKarti d={d} baslik={item} ac={ac} />}
      ListHeaderComponent={
        <>
          {ustCubuk}
          {aramaKutusu}
          {filtreCubugu}
          {heroBlok}
        </>
      }
      ListEmptyComponent={!hero ? <Durum d={d} mesaj={d.icerikYok} /> : null}
      initialNumToRender={4}
      windowSize={5}
      maxToRenderPerBatch={4}
    />
  );
}

// ————— Kapak (poster) —————
// cf_uid varsa CF thumbnail; yoksa TEMALI POSTER: başlık adından belirlenimci renk +
// filigran baş harf (+ geniş kartlarda başlık). Video altyapısı GEREKMEZ — gerçek
// kapak cf_uid gelince otomatik devreye girer. Yeni bağımlılık yok (hsl + View katmanı).
// İçerik türü (kategori) etiketi: dizi · kısa film · uzun film · film (eski/genel)
function turAdi(kind, d) {
  return kind === "dizi" ? d.dizi : kind === "kisa_film" ? d.kisaFilm : kind === "uzun_film" ? d.uzunFilm : d.film;
}
function adTonu(ad = "?") {
  let h = 0;
  for (let i = 0; i < ad.length; i++) h = (h * 31 + ad.charCodeAt(i)) % 360;
  return h;
}
function Kapak({ baslik, harf = 34, adGoster = false }) {
  const url = thumbUrl(baslik.videos?.[0]?.cf_uid);
  if (url)
    return (
      <ExpoImage
        source={{ uri: url }}
        style={{ width: "100%", height: "100%" }}
        cachePolicy="memory-disk"
        transition={150}
      />
    );
  const h = adTonu(baslik.name || "?");
  return (
    <View style={{ width: "100%", height: "100%", backgroundColor: `hsl(${h}, 44%, 20%)`, justifyContent: "flex-end" }}>
      <Text
        style={{
          position: "absolute",
          top: -harf * 0.3,
          right: harf * 0.15,
          fontSize: harf * 2.6,
          fontWeight: "800",
          color: `hsl(${h}, 58%, 46%)`,
          opacity: 0.4,
        }}
      >
        {(baslik.name?.[0] || "?").toUpperCase()}
      </Text>
      {adGoster ? (
        <Text
          numberOfLines={2}
          style={{ paddingHorizontal: 10, paddingVertical: 8, color: t.text, fontWeight: "700", fontSize: 14 }}
        >
          {baslik.name}
        </Text>
      ) : null}
    </View>
  );
}

// Dikey akış kartı: geniş kapak + başlık + tür satırı + 3 satır açıklama.
// gomulu=true → dış kap zaten yatay dolgulu (süzülmüş ızgara).
function AkisKarti({ d, baslik, ac, gomulu }) {
  return (
    <TouchableOpacity
      style={{ marginTop: gomulu ? 20 : 28, paddingHorizontal: gomulu ? 0 : 16 }}
      onPress={() => ac(baslik.id)}
      activeOpacity={0.85}
    >
      <View style={s.akisKapak}>
        <Kapak baslik={baslik} harf={44} adGoster />
        {baslik.haftalik && (
          <View style={s.haftalikRozet}>
            <Gradyan />
            <Text style={s.haftalikRozetYazi}>{d.haftalikRozet}</Text>
          </View>
        )}
      </View>
      <Text style={s.akisAd}>{baslik.name}</Text>
      <Text style={s.kartAlt}>
        {[turAdi(baslik.kind, d), baslik.genre, baslik.year]
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
  return (
    <TouchableOpacity
      style={s.sonucSatiri}
      onPress={() => ac(baslik.id)}
      activeOpacity={0.85}
    >
      <View style={s.sonucKapak}>
        <Kapak baslik={baslik} harf={26} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.kartAd} numberOfLines={1}>
          {baslik.name}
        </Text>
        <Text style={s.kartAlt}>
          {[turAdi(baslik.kind, d), baslik.genre]
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

// ————— Detay: web akışı (96375ed) mobil karşılığı — artık YÜKLEYİCİ —————
// Kart/deep-link → başlık gelince DOĞRUDAN oynatıcı (tek adım; ikinci "Filmi izle" tıkı yok).
// Tüm meta/aksiyonlar (üretici, Listem, kurucu rozeti, puan, açıklama, bölümler, BTS, Topluluk)
// artık Oynatici'de — web'deki tek-sayfa oynatıcı düzeniyle aynı.
function Detay({ d, id, user, girisAc, oynat, geri }) {
  const [hata, setHata] = useState(null);
  useEffect(() => {
    let aktif = true;
    getTitle(id)
      .then((b) => {
        if (!aktif) return;
        const ilk = b?.videos?.[0] || b?.yapimlar?.[0];
        if (ilk) oynat(ilk, b); // → { tip: "oynat" }; Detay bu render'da yükleyici kalır
        else setHata(d.bosSonuc || "—");
      })
      .catch((e) => aktif && setHata(e.message));
    return () => { aktif = false; };
  }, [id]);

  if (hata) return <Durum d={d} mesaj={hata} geri={geri} />;
  return <Durum d={d} yukleniyor geri={geri} />;
}

// ————— Üretici profil sayfası (Instagram/TikTok tarzı): avatar + ad + bio + sosyal + ürettiği içerikler —————
// Kaynak: public uretici_kartlari + yayınlanmış içerikler (RLS). Kendi profil düzenleme sistemine DOKUNMAZ.
function UreticiProfili({ d, id, ac, geri }) {
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

  const ad = uretici?.display_name || d.uretici;
  const linkler = uretici
    ? [
        ["instagram", "Instagram", uretici.instagram],
        ["tiktok", "TikTok", uretici.tiktok],
        ["youtube", "YouTube", uretici.youtube],
        ["twitter", "X", uretici.twitter],
        ["website", d.website, uretici.website],
      ].filter(([p, , ham]) => sosyalUrl(p, ham))
    : [];

  return (
    <ScrollView style={s.kap} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <GeriButon d={d} geri={geri} />

      {/* Başlık: gradient halkalı avatar + ad + içerik sayacı */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 16 }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
          <Gradyan />
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: t.surface2, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: t.accent, fontSize: 30, fontWeight: "800" }}>{(ad?.[0] || "?").toUpperCase()}</Text>
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: t.accent, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>{d.uretici}</Text>
          <Text style={{ color: t.text, fontSize: 22, fontWeight: "800", marginTop: 2 }} numberOfLines={2}>{ad}</Text>
          {icerikler !== null && (
            <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8, paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.line }}>
              <Text style={{ color: t.text, fontWeight: "800", fontSize: 13 }}>{icerikler.length}</Text>
              <Text style={{ fontSize: 11 }}>🎬</Text>
            </View>
          )}
        </View>
      </View>

      {!!uretici?.bio && (
        <Text style={{ color: t.text, opacity: 0.85, fontSize: 14, lineHeight: 20, marginTop: 16 }}>{uretici.bio}</Text>
      )}

      {linkler.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          {linkler.map(([p, etiket, ham]) => (
            <TouchableOpacity key={p} onPress={() => Linking.openURL(sosyalUrl(p, ham))} style={s.sosyalPill}>
              <Text style={s.sosyalPillYazi}>{etiket} ↗</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Ürettiği içerikler — 2 sütun poster ızgarası (Instagram/TikTok hissi) */}
      <View style={{ borderTopWidth: 1, borderTopColor: t.line, marginTop: 22, paddingTop: 18 }}>
        {icerikler === null ? (
          <ActivityIndicator color={t.accent} />
        ) : icerikler.length === 0 ? (
          <Text style={[s.dim, { textAlign: "center", paddingVertical: 24 }]}>—</Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
            {icerikler.map((b) => (
              <TouchableOpacity key={String(b.id)} style={{ width: "48%", marginBottom: 16 }} onPress={() => ac(b.id)} activeOpacity={0.85}>
                <View style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 10, overflow: "hidden", backgroundColor: t.surface2 }}>
                  <Kapak baslik={b} harf={30} />
                </View>
                <Text style={{ color: t.text, fontSize: 13, fontWeight: "600", marginTop: 6 }} numberOfLines={1}>{b.name}</Text>
                <Text style={{ color: t.dim, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                  {[turAdi(b.kind, d), b.genre].filter(Boolean).join(" · ")}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// ————— Oynatıcı: YouTube düzeni — video üstte sabit, altı kaydırılabilir —————
// Video yüzeyi — YALNIZ videoId/cfUid/altyaziDil'e bağlı memoize edilmiş WebView.
// Böylece Oynatici'nin diğer state'leri (Topluluk modalı, puan, üretici/Listem yüklemesi)
// değişince WebView YENİDEN OLUŞMAZ/DURMAZ. Yalnız videoId değişince remount (bölüm geçişi).
const VideoOynatici = memo(function VideoOynatici({ videoId, cfUid, altyaziDil }) {
  const source = useMemo(
    () => (cfUid ? { uri: iframeUrl(cfUid, altyaziDil) } : { html: testOynaticiHtml(TEST_HLS) }),
    [cfUid, altyaziDil]
  );
  return (
    <View style={{ aspectRatio: 16 / 9, backgroundColor: "#000" }}>
      <WebView
        key={videoId}
        source={source}
        originWhitelist={["*"]}
        style={{ backgroundColor: "#000" }}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
      />
    </View>
  );
});

function Oynatici({ d, dil, video, baslik, user, altyaziDil, oynat, geri, girisAc, ureticiAc }) {
  const [sohbetAcik, setSohbetAcik] = useState(false); // Topluluk: sayfa içinde (inline) açılır
  const [ekli, setEkli] = useState(null); // Listem: null bilinmiyor (Detay'dan taşındı)
  const [uretici, setUretici] = useState(null); // üretici kartı: ad + sosyal (Detay'dan taşındı)
  const kaydirRef = useRef(null); // Topluluk açılınca sayfayı bölümün başına kaydır
  const sohbetYRef = useRef(0); // Topluluk bölümünün ScrollView içindeki y konumu (onLayout)
  useEffect(() => {
    if (!sohbetAcik) return;
    // Bölümün başına kaydır (en alta değil) → başlık videoya yapışıp kırpılmaz
    const z = setTimeout(() => kaydirRef.current?.scrollTo({ y: Math.max(0, sohbetYRef.current - 8), animated: true }), 300);
    return () => clearTimeout(z);
  }, [sohbetAcik]);
  // Açılışta izlenme kaydı (girişliyse user_id ile → "devam et"; bölüm değişince yenisi)
  useEffect(() => {
    logWatch(video.id, user?.id ?? null);
  }, [video.id]);
  // Üretici + Listem: BAŞLIĞA bağlı (bölüm değişince gereksiz yeniden istek yok)
  useEffect(() => {
    let aktif = true;
    setUretici(null);
    if (baslik?.creator_id) getUreticiProfil(baslik.creator_id).then((u) => aktif && setUretici(u));
    return () => { aktif = false; };
  }, [baslik?.creator_id]);
  useEffect(() => {
    let aktif = true;
    setEkli(null);
    if (user) inMyList(user.id, baslik.id).then((e) => aktif && setEkli(e));
    return () => { aktif = false; };
  }, [user?.id, baslik.id]);

  async function listemDegistir() {
    if (!user) return girisAc();
    if (ekli === null) return;
    setEkli(!ekli); // iyimser
    await toggleMyList(user.id, baslik.id, ekli);
  }

  const dizi = baslik.kind === "dizi";

  return (
    <View style={s.kap}>
      {/* İnce geri şeridi */}
      <TouchableOpacity onPress={geri} style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
        <Text style={s.dim}>{d.geri}</Text>
      </TouchableOpacity>

      {/* Video en üstte, tam genişlik, sabit — memoize (modal/puan/üretici değişince reload YOK) */}
      <VideoOynatici videoId={video.id} cfUid={video.cf_uid} altyaziDil={altyaziDil} />

      {/* Altta kaydırılabilir bilgi + bölümler */}
      <ScrollView ref={kaydirRef} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
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

        {/* Aksiyon satırı: Listem + Topluluk (sayfa içinde inline açılır → video durmaz) */}
        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
          {(user ? ekli !== null : true) && (
            <TouchableOpacity style={s.listemDugme} onPress={listemDegistir}>
              <Text style={{ color: ekli ? t.dim : t.text, fontSize: 14, fontWeight: "600" }}>
                {ekli ? d.listemde : d.listemeEkle}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.listemDugme, sohbetAcik && { borderColor: t.accent }]}
            onPress={() => setSohbetAcik((v) => !v)}
          >
            <Text style={{ color: sohbetAcik ? t.accent : t.text, fontSize: 14, fontWeight: "600" }}>💬 {d.sohbet.baslik}</Text>
          </TouchableOpacity>
        </View>

        {/* Kurucu Ekip etiketi (şeffaflık) — Detay'dan taşındı */}
        {baslik.kurucu_icerigi && (
          <View style={[s.kurucuRozet, { marginTop: 14 }]}>
            <Gradyan />
            <Text style={s.kurucuRozetYazi}>{d.kurucuEkip}</Text>
          </View>
        )}

        {/* Üretici: ad + (varsa) sosyal linkler — Detay'dan taşındı */}
        {uretici && (uretici.display_name || uretici.bio ||
          [uretici.instagram, uretici.tiktok, uretici.youtube, uretici.twitter, uretici.website].some(Boolean)) && (
          <View style={{ marginTop: 18 }}>
            <Text style={[s.dim, { fontSize: 12, marginBottom: 6 }]}>{d.uretici}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              {/* Ada dokun → üretici profil sayfası (bio + ürettiği içerikler) */}
              <TouchableOpacity
                onPress={() => baslik.creator_id && ureticiAc?.(baslik.creator_id)}
                disabled={!baslik.creator_id}
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Text style={{ color: t.text, fontSize: 15, fontWeight: "700" }}>
                  {uretici.display_name || d.uretici}
                </Text>
                {baslik.creator_id ? <Text style={{ color: t.dim, fontSize: 15 }}>›</Text> : null}
              </TouchableOpacity>
              {[
                ["instagram", "Instagram", uretici.instagram],
                ["tiktok", "TikTok", uretici.tiktok],
                ["youtube", "YouTube", uretici.youtube],
                ["twitter", "X", uretici.twitter],
                ["website", d.website, uretici.website],
              ].map(([p, etiket, ham]) => {
                const url = sosyalUrl(p, ham);
                if (!url) return null;
                return (
                  <TouchableOpacity key={p} onPress={() => Linking.openURL(url)} style={s.sosyalPill}>
                    <Text style={s.sosyalPillYazi}>{etiket}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {!!uretici.bio && (
              <Text style={[s.dim, { fontSize: 13, marginTop: 8, lineHeight: 19 }]}>{uretici.bio}</Text>
            )}
          </View>
        )}

        {/* 1–10 halk oylaması — player'ın hemen altında, açıklamanın üstünde */}
        <MobilPuan video={video} user={user} girisAc={girisAc} d={d} />

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

        {/* Yapım Süreci (BTS) — ana bölümlerden ayrı, çapraz bağlı (M3) — Detay'dan taşındı */}
        {baslik.yapimlar?.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <Text style={s.altBaslik}>{d.yapimSureci}</Text>
            {baslik.yapimlar.map((b) => {
              const caliyor = b.id === video.id;
              return (
                <TouchableOpacity
                  key={b.id}
                  style={[s.bolumSatiri, caliyor && { borderColor: t.accent }]}
                  onPress={() => !caliyor && oynat(b, baslik)}
                  activeOpacity={caliyor ? 1 : 0.85}
                >
                  <Text style={[s.dim, { width: 52, textAlign: "center" }, caliyor && { color: t.accent }]}>🎬</Text>
                  <Text style={s.bolumAd} numberOfLines={1}>
                    {b.name || d.yapimSureci}
                  </Text>
                  <Text style={[s.dim, caliyor && { color: t.accent }]}>▶</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Topluluk — sayfa içinde (inline) sayfanın altına doğru açılır (yeni sayfa açmaz) */}
        <View onLayout={(e) => { sohbetYRef.current = e.nativeEvent.layout.y; }}>
          <Topluluk
            inline
            d={d} dil={dil} oda={`ep:${video.id}`} user={user}
            girisAc={girisAc} gorunur={sohbetAcik} kapat={() => setSohbetAcik(false)}
          />
        </View>
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
          return (
            <TouchableOpacity key={baslik.id} style={{ width: 150 }} onPress={bas} activeOpacity={0.85}>
              <View style={s.yatayKapak}>
                <Kapak baslik={baslik} harf={30} />
              </View>
              <Text style={s.kartAd} numberOfLines={1}>
                {baslik.name}
              </Text>
              <Text style={s.kartAlt}>
                {[turAdi(baslik.kind, d), baslik.genre].filter(Boolean).join(" · ")}
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
      {secili && <Gradyan />}
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
function Tablo({ d, user, girisAc, geri, sekmeModu }) {
  const [hafta, setHafta] = useState(undefined); // undefined: yükleniyor, null: yok
  const [hata, setHata] = useState(null);

  const yukle = () => {
    getBuHafta()
      .then(setHafta)
      .catch((e) => setHata(e.message));
  };
  useEffect(yukle, []);

  return (
    <ScrollView style={s.kap} contentContainerStyle={{ paddingBottom: sekmeModu ? 130 : 48 }}>
      <View style={s.ustSatir}>
        <Text style={s.marka}>{d.tablo.baslik}</Text>
        {/* Sekme modunda geri yok (alt nav'dan gelinir); tam ekranda geri kalır */}
        {geri && (
          <TouchableOpacity style={s.dilDugme} onPress={geri}>
            <Text style={s.dilYazi}>{d.geri}</Text>
          </TouchableOpacity>
        )}
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
      dokunBasari();
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
          <Gradyan />
            <Text style={s.izleYazi}>{d.tablo.girisGerek}</Text>
        </TouchableOpacity>
      ) : benim ? (
        <View>
          <ExpoImage source={{ uri: benim.url }} style={s.artGorsel} contentFit="contain" cachePolicy="memory-disk" />
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
              <ExpoImage source={{ uri: varlik.uri }} style={s.artGorsel} contentFit="contain" cachePolicy="memory-disk" />
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
            <Gradyan />
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
    dokunBasari();
    setOyluIds((e) => [...e, pieceId]);
    await artOyVer(pieceId, user.id, hafta.tur);
  }

  if (!user) {
    return (
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <Text style={s.rafBaslik}>{d.tablo.elemeBaslik}</Text>
        <TouchableOpacity style={s.izleDugme} onPress={girisAc}>
          <Gradyan />
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
              <ExpoImage source={{ uri: e.url }} style={s.artGorsel} contentFit="contain" cachePolicy="memory-disk" />
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
    dokunBasari();
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
              <ExpoImage source={{ uri: e.url }} style={s.artGorsel} contentFit="contain" cachePolicy="memory-disk" />
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
  cip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, overflow: "hidden" },
  cipSecili: { backgroundColor: t.accent },
  cipPasif: { borderColor: t.line, borderWidth: 1 },
  cipYazi: { fontSize: 13, fontWeight: "600" },
  // Premium alt navigasyon: yüzen, yuvarlak, yükseltilmiş koyu yüzey
  altNavSar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },
  altNav: {
    flexDirection: "row",
    backgroundColor: "#15151A",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: t.line,
    paddingVertical: 6,
    paddingHorizontal: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 14,
  },
  altNavOge: { flex: 1, alignItems: "center" },
  altNavPill: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 16,
    overflow: "hidden",
    minWidth: 56,
  },
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
    overflow: "hidden", // Gradyan (mutlak-dolgu) köşe yarıçapına kırpılsın
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
  haftalikRozet: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  haftalikRozetYazi: { color: "#0A0A0B", fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  sosyalPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: t.line,
    backgroundColor: t.surface,
  },
  sosyalPillYazi: { color: t.text, fontSize: 12 },
  kurucuRozet: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: "hidden",
    marginBottom: 16,
  },
  kurucuRozetYazi: { color: "#0A0A0B", fontSize: 12, fontWeight: "800", letterSpacing: 0.3 },
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
