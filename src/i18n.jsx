// Dil desteği: varsayılan İngilizce, Türkçe seçilebilir (üst menüdeki EN/TR anahtarı).
// Metinlerin kendisi src/metinler.js'te (saf veri) — denetim: npm run dil:kontrol.
// Seçim cihazda saklanır — girişsiz izleyicide de çalışması gerektiği için bilinçli
// olarak localStorage kullanılır (kalıcı ürün verisi değil, cihaz tercihi).
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { METINLER } from "./metinler";

export { METINLER };

const DIL_ANAHTARI = "latent_dil";

// Kayıtlı tercih > İngilizce (varsayılan). Tarayıcı dili bilinçli olarak
// kullanılmıyor: ürün global, arayüz İngilizce açılır; TR anahtarla seçilir.
export function mevcutDil() {
  try {
    const kayitli = localStorage.getItem(DIL_ANAHTARI);
    if (kayitli && kayitli in METINLER) return kayitli;
  } catch {
    /* localStorage kapalıysa varsayılan kalır */
  }
  return "en";
}

const DilBaglami = createContext(null);

export function DilSaglayici({ children }) {
  const [dil, setDilState] = useState(mevcutDil);

  // <html lang/dir> ve sekme başlığını dille eşle. Başlık yalnızca taban başlıkken
  // değiştirilir — detay sayfası içerik adını yazdıysa ona dokunulmaz.
  // Arapça = sağdan-sola (RTL): document.dir'i çeviririz; metin akışı ve hizalama döner.
  useEffect(() => {
    const RTL_DILLER = ["ar"]; // ileride he/fa eklenebilir
    document.documentElement.lang = dil;
    document.documentElement.dir = RTL_DILLER.includes(dil) ? "rtl" : "ltr";
    const tabanlar = Object.values(METINLER).map((m) => m.belgeBasligi);
    if (tabanlar.includes(document.title)) {
      document.title = METINLER[dil].belgeBasligi;
    }
  }, [dil]);

  const deger = useMemo(
    () => ({
      dil,
      s: METINLER[dil],
      setDil: (yeni) => {
        try {
          localStorage.setItem(DIL_ANAHTARI, yeni);
        } catch {
          /* saklanamazsa yalnızca oturumluk kalır */
        }
        setDilState(yeni);
      },
    }),
    [dil]
  );

  return <DilBaglami.Provider value={deger}>{children}</DilBaglami.Provider>;
}

export function useLang() {
  return useContext(DilBaglami);
}
