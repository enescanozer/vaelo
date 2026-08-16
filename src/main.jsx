// React giriş noktası: dil + ayar sağlayıcı + en dış hata yakalayıcı (beklenmedik
// çökmede boş ekran yerine sade bir kurtarma ekranı gösterir)
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { DilSaglayici, METINLER, mevcutDil } from "./i18n";
import { AyarSaglayici } from "./ayarlar";
import { t } from "./theme";

class HataYakalayici extends React.Component {
  state = { hata: null };

  static getDerivedStateFromError(hata) {
    return { hata };
  }

  render() {
    if (this.state.hata) {
      // Sağlayıcının dışında olduğundan dili doğrudan okur
      // (`s` adı tam dil tablosuna ayrılmıştır — bkz. scripts/dil-kontrol.mjs)
      const hataMetni = METINLER[mevcutDil()].hataEkrani;
      return (
        <div
          style={{
            minHeight: "100vh",
            background: t.bg,
            color: t.text,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            fontFamily: t.font,
            padding: 40,
            textAlign: "center",
          }}
        >
          <div style={{ fontFamily: t.display, fontWeight: 800, fontSize: 24 }}>
            {hataMetni.baslik}
          </div>
          <div style={{ color: t.dim, fontSize: 14, maxWidth: 420, lineHeight: 1.5 }}>
            {hataMetni.govde}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: t.gradient,
              color: "#0A0A0B",
              border: "none",
              borderRadius: 8,
              padding: "11px 24px",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {hataMetni.yenile}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Not: StrictMode bilinçli kapalı — geliştirmede her etkiyi (dolayısıyla her ağ
// isteğini) iki kez koşturup algılanan performansı belirgin düşürüyordu. Etkiler
// zaten iptal korumalı (aktif bayrağı/temizleme) olduğundan güvenle kapatıldı.
// Root'u idempotent tut: HMR main.jsx'i yeniden çalıştırdığında createRoot'u
// aynı #root'a ikinci kez çağırmak "container already passed" uyarısı verip
// ağaçları çakıştırıyordu. Mevcut root'u saklayıp yeniden render ediyoruz.
// Paylaşım linki attribution: ?ref=<uretici_id> geldiyse (uuid biçimindeyse) sakla.
// Kayıt sırasında signUp bunu metadata'ya ekler; sunucu yalnız gerçek üreticiyi kabul eder.
try {
  const ref = new URLSearchParams(window.location.search).get("ref");
  if (ref && /^[0-9a-f-]{36}$/i.test(ref)) localStorage.setItem("vaelo_ref", ref);
} catch {
  /* localStorage yoksa sessizce geç */
}

const kap = document.getElementById("root");
const kok = (globalThis.__latentKok ??= createRoot(kap));
kok.render(
  <HataYakalayici>
    <DilSaglayici>
      <AyarSaglayici>
        <App />
      </AyarSaglayici>
    </DilSaglayici>
  </HataYakalayici>
);
