// Dil paketi denetimi: (1) en/tr sözlük anahtar ağaçlarını karşılaştırır,
// (2) src/ altındaki kodda kullanılan her `s.x.y...` anahtarının İKİ dilde de
// var olduğunu doğrular. Kırık/eksik anahtar varsa 1 ile çıkar.
//   çalıştır:  npm run dil:kontrol
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { METINLER } from "../src/metinler.js";

const kok = join(dirname(fileURLToPath(import.meta.url)), "..");
let hatali = 0;
const hata = (mesaj) => {
  console.log(`  ✗ ${mesaj}`);
  hatali++;
};

// ————— 1) Anahtar ağacı karşılaştırması —————
function yapraklar(nesne, onEk = "") {
  return Object.entries(nesne).flatMap(([anahtar, deger]) =>
    deger !== null && typeof deger === "object"
      ? yapraklar(deger, `${onEk}${anahtar}.`)
      : [`${onEk}${anahtar}`]
  );
}

const diller = Object.keys(METINLER);
console.log(`Dil paketi denetimi (${diller.join(", ")})\n————————————————`);

const enAnahtarlar = new Set(yapraklar(METINLER.en));
for (const dil of diller.filter((d) => d !== "en")) {
  const digerleri = new Set(yapraklar(METINLER[dil]));
  for (const a of enAnahtarlar) {
    if (!digerleri.has(a)) hata(`'${dil}' sözlüğünde eksik: ${a}`);
  }
  for (const a of digerleri) {
    if (!enAnahtarlar.has(a)) hata(`'${dil}' sözlüğünde fazla (en'de yok): ${a}`);
  }
}
console.log(`  ${enAnahtarlar.size} anahtar karşılaştırıldı`);

// ————— 2) Kod kullanım taraması —————
// `s.` her zaman dil tablosudur (stil nesneleri farklı adlandırılır).
// Zincirin her parçası sözlükte bulunmalı; köşeli parantez erişimi ([x])
// nesne yaprağına kadar doğrulanır.
const kaynakDizin = join(kok, "src");
const dosyalar = readdirSync(kaynakDizin).filter(
  (a) => (a.endsWith(".jsx") || a.endsWith(".js")) && a !== "metinler.js"
);

const desen = /\bs\.((?:[A-Za-z_$][\w$]*)(?:\.[A-Za-z_$][\w$]*)*)/g;
let kullanimSayisi = 0;
const gorulen = new Set();

for (const dosya of dosyalar) {
  const icerik = readFileSync(join(kaynakDizin, dosya), "utf8");
  for (const eslesme of icerik.matchAll(desen)) {
    const yol = eslesme[1];
    if (gorulen.has(yol)) continue;
    gorulen.add(yol);
    kullanimSayisi++;
    for (const dil of diller) {
      let dugum = METINLER[dil];
      for (const parca of yol.split(".")) {
        dugum = dugum?.[parca];
        if (dugum === undefined) {
          hata(`${dosya}: s.${yol} → '${dil}' sözlüğünde yok`);
          break;
        }
      }
    }
  }
}
console.log(`  ${kullanimSayisi} farklı anahtar kullanımı tarandı (${dosyalar.length} dosya)`);

if (hatali) {
  console.log(`\n${hatali} sorun bulundu.`);
  process.exit(1);
}
console.log("\nDil paketleri tutarlı — sorun yok.");
