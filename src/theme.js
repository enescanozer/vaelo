// Tasarım token'ları — koyu tema, tek vurgu rengi. Tüm ekranlar buradan okur.
export const t = {
  bg: "#0A0A0B",
  surface: "#121214",
  surface2: "#15151A",
  line: "#222226",
  text: "#ECEEE9",
  dim: "#8C8F88",
  // Marka vurgusu. Gradient bir "renk" olmadığından ikiye ayrılır:
  //   accent   → katı temsil rengi (kenarlık, metin, nokta, odak halkası)
  //   gradient → dolgu (buton/çip/bar arka planları)   [eski lime #CDFF4A kaldırıldı]
  accent: "#FF4DBD",
  gradient: "linear-gradient(135deg, #FF7A45 0%, #FF4DBD 45%, #A855F7 100%)",
  gradientHover: "linear-gradient(135deg, #FF8A5A 0%, #FF63C9 45%, #B56BF9 100%)",
  danger: "#E2574C",
  font: "'Hanken Grotesk', sans-serif",
  display: "'Syne', sans-serif",
  // Yatay sayfa dolgusu: geniş ekranda 40px, dar ekranda 16px'e iner
  pad: "clamp(16px, 4vw, 40px)",
};
