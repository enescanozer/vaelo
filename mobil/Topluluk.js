// Topluluk — mobil CANLI SOHBET (web Forum.jsx'in RN karşılığı). RN Modal olarak açılır →
// çağıran ekran (Oynatıcı) UNMOUNT OLMAZ, video durmaz. Backend web ile AYNI (sohbet_* RPC/action).
// Özellikler: mesaj listesi + gönder, realtime (mesaj + like), reply + preview + scroll,
// mention @autocomplete + tıklanabilir, spoiler, like/unlike, kendi mesajında ⋯ (Düzenle/Sil).
// Moderasyon forum-post içinde (değişmez). Renkler App.js paletiyle AYNI (self-contained → circular dep yok).
import { useEffect, useRef, useState } from "react";
import {
  Modal, View, Text, TextInput, TouchableOpacity, FlatList, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  sohbetGetir, sohbetOdaDurum, sohbetGonder, sohbetDuzenle, sohbetMesajSil,
  sohbetBegen, sohbetBegenKaldir, sohbetKullaniciAra,
  sohbetAbone, sohbetBegeniAbone, sohbetAbonelikBirak,
} from "./api";

const C = { bg: "#0A0A0B", surface: "#121214", surface2: "#15151A", line: "#222226", text: "#ECEEE9", dim: "#8C8F88", accent: "#FF4DBD", danger: "#E2574C" };
const MAX = 5000;

function hataMetni(sh, kod) { return (sh?.hata && sh.hata[kod]) || sh?.hata?.sunucu || "…"; }

// Göreceli zaman — Hermes Intl'i tam olmayabilir → try/catch + dil-nötr fallback.
function goreceliZaman(iso, locale) {
  const sn = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  try {
    const rtf = new Intl.RelativeTimeFormat(locale || "en", { numeric: "auto" });
    if (sn < 60) return rtf.format(-Math.floor(sn), "second");
    if (sn < 3600) return rtf.format(-Math.floor(sn / 60), "minute");
    if (sn < 86400) return rtf.format(-Math.floor(sn / 3600), "hour");
    return rtf.format(-Math.floor(sn / 86400), "day");
  } catch {
    if (sn < 60) return "•";
    if (sn < 3600) return Math.floor(sn / 60) + "m";
    if (sn < 86400) return Math.floor(sn / 3600) + "h";
    return Math.floor(sn / 86400) + "d";
  }
}

// @mention token'larını accent + tıklanabilir Text'e çevirir (Discord/Reddit hissi).
function mesajParcalari(metin, onMention) {
  return String(metin ?? "").split(/(@[A-Za-z0-9_.]+)/g).map((p, i) => {
    if (/^@[A-Za-z0-9_.]+$/.test(p)) {
      return (
        <Text key={i} style={{ color: C.accent, fontWeight: "600" }} onPress={() => onMention && onMention(p.slice(1))}>
          {p}
        </Text>
      );
    }
    return <Text key={i}>{p}</Text>;
  });
}

export default function Topluluk({ d, dil, oda, user, girisAc, gorunur, kapat, inline }) {
  const sh = d.sohbet;
  const inset = useSafeAreaInsets();
  const [mesajlar, setMesajlar] = useState(null);
  const [kilitli, setKilitli] = useState(false);
  const [yanitHedef, setYanitHedef] = useState(null);
  const [prefill, setPrefill] = useState(null); // mention tıklama → composer'a ekle
  const listeRef = useRef(null); // FlatList (Modal modu)
  const icListeRef = useRef(null); // düz ScrollView (inline modu → VirtualizedList uyarısı yok)

  // id ile tekilleştir (optimistik + realtime yankısı çakışmaz)
  function ekle(m) {
    setMesajlar((eski) => {
      if (!eski) return [m];
      if (eski.some((x) => x.id === m.id)) return eski;
      return [...eski, m];
    });
  }

  // İlk yükleme + realtime (yalnız açıkken). Kapanış/oda değişimi → cleanup (unsubscribe).
  useEffect(() => {
    if (!gorunur) return;
    let aktif = true;
    setMesajlar(null);
    setYanitHedef(null);
    sohbetGetir(oda).then((m) => aktif && setMesajlar(m)).catch(() => aktif && setMesajlar([]));
    sohbetOdaDurum(oda).then((k) => aktif && setKilitli(k)).catch(() => {});

    const kanal = sohbetAbone(
      oda,
      (yeni) => aktif && ekle({ ...yeni, begeni_sayisi: yeni.begeni_sayisi ?? 0, benim_begenim: yeni.benim_begenim ?? false }),
      (guncel) => {
        if (!aktif) return;
        if (guncel.status !== "visible" || guncel.deleted_at) {
          setMesajlar((eski) => (eski ?? []).filter((x) => x.id !== guncel.id));
        } else {
          setMesajlar((eski) => (eski ?? []).map((x) => (x.id === guncel.id ? { ...x, mesaj: guncel.mesaj } : x)));
        }
      },
      (durum) => {
        // SUBSCRIBED kontrolü: yeniden bağlanınca kaçan mesajları yakalamak için listeyi tazele.
        if (aktif && durum === "SUBSCRIBED") sohbetGetir(oda).then((m) => aktif && setMesajlar(m)).catch(() => {});
      }
    );
    const begeniKanal = sohbetBegeniAbone(oda, (mesajId, userId, tip) => {
      if (!aktif || userId === user?.id) return; // kendi like'ım optimistik → çift sayma
      setMesajlar((eski) => (eski ?? []).map((x) =>
        x.id === mesajId ? { ...x, begeni_sayisi: Math.max(0, (Number(x.begeni_sayisi) || 0) + (tip === "ekle" ? 1 : -1)) } : x));
    });

    return () => { aktif = false; sohbetAbonelikBirak(kanal); sohbetAbonelikBirak(begeniKanal); };
  }, [oda, gorunur, user?.id]);

  // Like aç/kapa — optimistik + RLS (duplicate PK 23505 → zaten var, iyimser doğru)
  async function begenDegis(m) {
    if (!user) return girisAc();
    const yeni = !m.benim_begenim;
    const uygula = (aktif) => setMesajlar((eski) => (eski ?? []).map((x) =>
      x.id === m.id ? { ...x, benim_begenim: aktif, begeni_sayisi: Math.max(0, (Number(x.begeni_sayisi) || 0) + (aktif ? 1 : -1)) } : x));
    uygula(yeni);
    const r = yeni ? await sohbetBegen(m.id, user.id, oda) : await sohbetBegenKaldir(m.id, user.id);
    if (r.error && r.error.code !== "23505") uygula(!yeni);
  }
  async function mesajSil(id) {
    const { error } = await sohbetMesajSil(id);
    if (!error) setMesajlar((eski) => (eski ?? []).filter((x) => x.id !== id));
  }
  async function mesajDuzenle(id, yeniMetin) {
    const r = await sohbetDuzenle({ id, content: yeniMetin.trim(), lang: (dil || "en").slice(0, 2) });
    if (!r.hata) setMesajlar((eski) => (eski ?? []).map((x) => (x.id === id ? { ...x, mesaj: yeniMetin.trim() } : x)));
    return r;
  }
  function mesajaScroll(id) {
    const idx = (mesajlar ?? []).findIndex((x) => x.id === id);
    if (idx >= 0 && listeRef.current) {
      try { listeRef.current.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 }); } catch { /* getItemLayout yok → fallback aşağıda */ }
    }
  }
  const mentionTikla = (nick) => setPrefill({ metin: `@${nick} `, nonce: Date.now() });

  // Mesaj listesi (flex:1 → hem Modal'da hem inline sabit-yükseklik kutuda çalışır)
  const liste = mesajlar === null ? (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={C.accent} /></View>
  ) : mesajlar.length === 0 ? (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
      <Text style={{ color: C.dim, fontSize: 14, textAlign: "center" }}>{sh.bos}</Text>
    </View>
  ) : (
    <FlatList
      ref={listeRef}
      data={mesajlar}
      keyExtractor={(m) => String(m.id)}
      contentContainerStyle={{ padding: 16, gap: 14 }}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      onContentSizeChange={() => listeRef.current?.scrollToEnd({ animated: false })}
      onScrollToIndexFailed={(info) => {
        listeRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
      }}
      renderItem={({ item }) => (
        <SohbetMesaj
          m={item} user={user} sh={sh} dil={dil}
          onBegen={() => begenDegis(item)}
          onYanitla={() => setYanitHedef(item)}
          onScrollTo={mesajaScroll}
          onMention={mentionTikla}
          onSil={mesajSil}
          onDuzenle={mesajDuzenle}
        />
      )}
    />
  );
  const yazac = (
    <SohbetYazac
      sh={sh} dil={dil} oda={oda} user={user} girisAc={girisAc} kilitli={kilitli} ekle={ekle}
      yanitHedef={yanitHedef} yanitIptal={() => setYanitHedef(null)} prefill={prefill}
      bottomInset={inline ? 0 : inset.bottom}
    />
  );

  // Inline: yeni sayfa AÇMAZ — çağıran ScrollView'ın içinde, sayfanın altına doğru açılır.
  // Video ScrollView'ın dışında sabit olduğundan burada da video DURMAZ.
  // Mesajlar düz ScrollView ile (FlatList değil) → "VirtualizedList nested" uyarısı olmaz.
  if (inline) {
    if (!gorunur) return null;
    const icListe = mesajlar === null ? (
      <View style={{ paddingVertical: 32, alignItems: "center" }}><ActivityIndicator color={C.accent} /></View>
    ) : mesajlar.length === 0 ? (
      <View style={{ paddingVertical: 32, paddingHorizontal: 20, alignItems: "center" }}>
        <Text style={{ color: C.dim, fontSize: 14, textAlign: "center" }}>{sh.bos}</Text>
      </View>
    ) : (
      <ScrollView
        ref={icListeRef}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 16 }}
        onContentSizeChange={() => icListeRef.current?.scrollToEnd({ animated: false })}
      >
        {mesajlar.map((item) => (
          <SohbetMesaj
            key={String(item.id)}
            m={item} user={user} sh={sh} dil={dil}
            onBegen={() => begenDegis(item)}
            onYanitla={() => setYanitHedef(item)}
            onScrollTo={mesajaScroll}
            onMention={mentionTikla}
            onSil={mesajSil}
            onDuzenle={mesajDuzenle}
          />
        ))}
      </ScrollView>
    );
    return (
      <View style={{ marginTop: 26, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 18 }}>
        {/* Başlık */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
          <Text style={{ flex: 1, color: C.text, fontSize: 17, fontWeight: "800" }}>💬  {sh.baslik}</Text>
          <TouchableOpacity
            onPress={kapat}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: C.dim, fontSize: 15 }}>✕</Text>
          </TouchableOpacity>
        </View>
        {/* Mesaj kutusu: içeriğe göre büyür, en fazla 360 → kompakt, boş görünmez */}
        <View style={{ maxHeight: 360, borderWidth: 1, borderColor: C.line, borderRadius: 14, backgroundColor: C.surface, overflow: "hidden" }}>
          {icListe}
        </View>
        <View style={{ marginTop: 10 }}>{yazac}</View>
      </View>
    );
  }

  return (
    <Modal visible={gorunur} animationType="slide" transparent={false} onRequestClose={kapat} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: inset.top }}>
        {/* Başlık */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <Text style={{ flex: 1, color: C.text, fontSize: 18, fontWeight: "800" }}>{sh.baslik}</Text>
          <TouchableOpacity onPress={kapat} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: C.dim, fontSize: 22 }}>✕</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={inset.top}>
          {liste}
          {yazac}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ————— Tek mesaj: reply preview + nickname/zaman + ⋯(kendi) + spoiler + metin(mention) + like/reply —————
function SohbetMesaj({ m, user, sh, dil, onBegen, onYanitla, onScrollTo, onMention, onSil, onDuzenle }) {
  const [acik, setAcik] = useState(false);
  const [duzenle, setDuzenle] = useState(false);
  const [taslak, setTaslak] = useState(m.mesaj);
  const [dHata, setDHata] = useState(null);
  const [dBekle, setDBekle] = useState(false);
  const gizli = m.is_spoiler && !acik;
  const benimki = user && m.user_id === user.id;
  const begendim = !!m.benim_begenim;
  const sayi = Number(m.begeni_sayisi) || 0;

  function menuAc() {
    Alert.alert(m.nickname || "", undefined, [
      { text: sh.duzenle, onPress: () => { setTaslak(m.mesaj); setDHata(null); setDuzenle(true); } },
      { text: sh.sil, style: "destructive", onPress: () => Alert.alert(sh.sil + "?", undefined, [
        { text: sh.iptal, style: "cancel" },
        { text: sh.sil, style: "destructive", onPress: () => onSil(m.id) },
      ]) },
      { text: sh.iptal, style: "cancel" },
    ]);
  }
  async function kaydet() {
    const g = taslak.trim();
    if (!g || dBekle) return;
    setDBekle(true); setDHata(null);
    const r = await onDuzenle(m.id, g);
    setDBekle(false);
    if (r?.hata) return setDHata(hataMetni(sh, r.kod));
    setDuzenle(false);
  }

  return (
    <View style={{ gap: 4 }}>
      {/* Reply önizlemesi (parent'a dokun → scroll). Preview yazma anında yakalandı → parent silinse de kalır. */}
      {(m.reply_to || m.reply_ozet) ? (
        <TouchableOpacity activeOpacity={0.7} disabled={!m.reply_to} onPress={() => m.reply_to && onScrollTo(m.reply_to)}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, borderLeftWidth: 2, borderLeftColor: C.line, paddingLeft: 8 }}>
          <Text style={{ color: C.dim, fontSize: 11 }}>↩ {m.reply_nickname || "—"}</Text>
          <Text numberOfLines={1} style={{ color: C.dim, fontSize: 11, flex: 1 }}>{m.reply_ozet || ""}</Text>
        </TouchableOpacity>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontWeight: "700", fontSize: 13, color: benimki ? C.accent : C.text }}>{m.nickname || "—"}</Text>
        <Text style={{ color: C.dim, fontSize: 11 }}>{goreceliZaman(m.created_at, dil)}</Text>
        <View style={{ flex: 1 }} />
        {benimki && !duzenle ? (
          <TouchableOpacity onPress={menuAc} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: C.dim, fontSize: 16 }}>⋯</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {duzenle ? (
        <View style={{ gap: 6 }}>
          <TextInput value={taslak} onChangeText={(x) => setTaslak(x.slice(0, MAX))} multiline autoFocus
            style={{ backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, borderRadius: 10, color: C.text, fontSize: 14, padding: 10, minHeight: 44 }} />
          {dHata ? <Text style={{ color: C.danger, fontSize: 12 }}>{dHata}</Text> : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity onPress={kaydet} disabled={!taslak.trim() || dBekle}
              style={{ backgroundColor: C.accent, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 14, opacity: (!taslak.trim() || dBekle) ? 0.6 : 1 }}>
              <Text style={{ color: "#0A0A0B", fontWeight: "700", fontSize: 13 }}>{sh.kaydet}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setDuzenle(false); setDHata(null); }}
              style={{ borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 14 }}>
              <Text style={{ color: C.dim, fontSize: 13 }}>{sh.iptal}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          {gizli ? (
            <TouchableOpacity onPress={() => setAcik(true)} style={{ backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, borderStyle: "dashed", borderRadius: 8, padding: 12, alignItems: "center" }}>
              <Text style={{ color: C.accent, fontSize: 12, fontWeight: "600" }}>{sh.spoilerGoster}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>{mesajParcalari(m.mesaj, onMention)}</Text>
          )}

          {!gizli ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 18, marginTop: 2 }}>
              <TouchableOpacity onPress={onBegen} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Text style={{ color: begendim ? C.accent : C.dim, fontSize: 15 }}>{begendim ? "♥" : "♡"}</Text>
                {sayi > 0 ? <Text style={{ color: begendim ? C.accent : C.dim, fontSize: 12 }}>{sayi}</Text> : null}
              </TouchableOpacity>
              <TouchableOpacity onPress={onYanitla} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Text style={{ color: C.dim, fontSize: 12 }}>↩ {sh.yanitla}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

// ————— Composer: reply bar + mention autocomplete + spoiler + gönder —————
function SohbetYazac({ sh, dil, oda, user, girisAc, kilitli, ekle, yanitHedef, yanitIptal, prefill, bottomInset }) {
  const [metin, setMetin] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState(null);
  const [mentionListe, setMentionListe] = useState([]);
  const mentionHarita = useRef(new Map()); // lower(display_name) → id
  const girisRef = useRef(null);

  useEffect(() => {
    if (!prefill) return;
    setMetin((m) => (m ? m.replace(/\s*$/, " ") : "") + prefill.metin);
    girisRef.current?.focus();
  }, [prefill?.nonce]);

  const pad = { paddingBottom: (bottomInset || 0) + 10 };
  if (!user) {
    return (
      <View style={[{ borderTopWidth: 1, borderTopColor: C.line, padding: 12 }, pad]}>
        <TouchableOpacity onPress={girisAc} style={{ backgroundColor: C.accent, borderRadius: 10, paddingVertical: 12, alignItems: "center" }}>
          <Text style={{ color: "#0A0A0B", fontWeight: "700", fontSize: 14 }}>{sh.giris}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (kilitli) {
    return (
      <View style={[{ borderTopWidth: 1, borderTopColor: C.line, padding: 12 }, pad]}>
        <Text style={{ color: C.dim, fontSize: 13, textAlign: "center" }}>🔒 {sh.kilit}</Text>
      </View>
    );
  }

  async function metinDegis(x) {
    setMetin(x.slice(0, MAX));
    const es = /(?:^|\s)@([A-Za-z0-9_.]{1,20})$/.exec(x);
    if (es) setMentionListe(await sohbetKullaniciAra(es[1]));
    else setMentionListe([]);
  }
  function mentionSec(u) {
    setMetin((m) => m.replace(/(^|\s)@([A-Za-z0-9_.]{1,20})$/, `$1@${u.display_name} `));
    mentionHarita.current.set(u.display_name.toLowerCase(), u.id);
    setMentionListe([]);
    girisRef.current?.focus();
  }
  async function gonder() {
    const g = metin.trim();
    if (!g || bekliyor) return;
    setBekliyor(true); setHata(null);
    const mentions = [];
    for (const es of g.matchAll(/@([A-Za-z0-9_.]+)/g)) {
      const id = mentionHarita.current.get(es[1].toLowerCase());
      if (id && !mentions.includes(id)) mentions.push(id);
    }
    const r = await sohbetGonder({ oda, content: g, is_spoiler: spoiler, lang: (dil || "en").slice(0, 2), reply_to: yanitHedef?.id ?? null, mentions });
    setBekliyor(false);
    if (r.hata) return setHata(hataMetni(sh, r.kod));
    if (r.mesaj) ekle(r.mesaj); // optimistik (realtime yankısı id ile tekilleştirilir)
    setMetin(""); setSpoiler(false); setMentionListe([]);
    mentionHarita.current.clear();
    yanitIptal && yanitIptal();
  }

  const kapali = !metin.trim() || bekliyor;
  return (
    <View style={[{ borderTopWidth: 1, borderTopColor: C.line, padding: 12 }, pad]}>
      {yanitHedef ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, padding: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 8 }}>
          <Text numberOfLines={1} style={{ color: C.dim, fontSize: 12, flex: 1 }}>
            ↩ {sh.yanitliyor} <Text style={{ color: C.text, fontWeight: "700" }}>{yanitHedef.nickname}</Text>: {String(yanitHedef.mesaj || "").slice(0, 50)}
          </Text>
          <TouchableOpacity onPress={yanitIptal}><Text style={{ color: C.dim, fontSize: 16 }}>✕</Text></TouchableOpacity>
        </View>
      ) : null}

      {mentionListe.length > 0 ? (
        <View style={{ marginBottom: 8, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, borderRadius: 10, overflow: "hidden" }}>
          {mentionListe.map((u) => (
            <TouchableOpacity key={u.id} onPress={() => mentionSec(u)} style={{ paddingVertical: 9, paddingHorizontal: 12 }}>
              <Text style={{ color: C.text, fontSize: 13 }}><Text style={{ color: C.accent }}>@</Text>{u.display_name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {hata ? <Text style={{ color: C.danger, fontSize: 12, marginBottom: 6 }}>{hata}</Text> : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        <TouchableOpacity onPress={() => setSpoiler((v) => !v)}
          style={{ width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: spoiler ? C.accent : C.line, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: spoiler ? C.accent : C.dim, fontSize: 16 }}>⚠</Text>
        </TouchableOpacity>
        <TextInput
          ref={girisRef}
          value={metin}
          onChangeText={metinDegis}
          placeholder={sh.yer}
          placeholderTextColor={C.dim}
          multiline
          maxLength={MAX}
          style={{ flex: 1, minHeight: 40, maxHeight: 120, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, borderRadius: 10, color: C.text, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 }}
        />
        <TouchableOpacity onPress={gonder} disabled={kapali}
          style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: C.accent, alignItems: "center", justifyContent: "center", opacity: kapali ? 0.5 : 1 }}>
          <Text style={{ color: "#0A0A0B", fontSize: 16, fontWeight: "700" }}>➤</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
