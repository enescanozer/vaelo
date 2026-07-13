// İzleyici ayarları: alt yazı tercihi (cihazda kalıcı — kullanıcı hesabı gerektirmez,
// bu yüzden bilinçli localStorage). Dil tercihi ayrıca i18n.jsx'te tutulur; Ayarlar
// ekranı ikisini bir araya getirir.
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const ANAHTAR = "latent_ayarlar";

function yukle() {
  try {
    const ham = localStorage.getItem(ANAHTAR);
    if (ham) return { altyaziAcik: false, altyaziDil: "", ...JSON.parse(ham) };
  } catch {
    /* localStorage kapalı ya da bozuk JSON → varsayılan */
  }
  return { altyaziAcik: false, altyaziDil: "" }; // altyaziDil="" → arayüz dilini kullan
}

const AyarBaglami = createContext(null);

export function AyarSaglayici({ children }) {
  const [ayarlar, setAyarlar] = useState(yukle);

  useEffect(() => {
    try {
      localStorage.setItem(ANAHTAR, JSON.stringify(ayarlar));
    } catch {
      /* saklanamazsa yalnızca oturumluk kalır */
    }
  }, [ayarlar]);

  const deger = useMemo(
    () => ({
      ayarlar,
      ayarla: (parca) => setAyarlar((eski) => ({ ...eski, ...parca })),
    }),
    [ayarlar]
  );

  return <AyarBaglami.Provider value={deger}>{children}</AyarBaglami.Provider>;
}

export function useAyarlar() {
  return useContext(AyarBaglami);
}
