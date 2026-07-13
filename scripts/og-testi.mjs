// OG prerender fonksiyonunun yerel bütünleşme testi: gerçek (yerel) Supabase'e
// sorar, dist/index.html üzerinde meta değişimini doğrular.
//   önkoşul: npx supabase start çalışıyor + npm run build alınmış
//   çalıştır: npm run og:test
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const kok = join(dirname(fileURLToPath(import.meta.url)), "..");

// .env'den yerel bağlantı bilgileri
const env = readFileSync(join(kok, ".env"), "utf8");
const oku = (anahtar) => env.match(new RegExp(`^${anahtar}=(.+)$`, "m"))?.[1]?.trim();
const SUPABASE_URL = oku("VITE_SUPABASE_URL");
const SUPABASE_ANON_KEY = oku("VITE_SUPABASE_ANON_KEY");

const html = readFileSync(join(kok, "dist", "index.html"), "utf8");
const { onRequest } = await import(
  pathToFileURL(join(kok, "functions", "[[yol]].js")).href
);

// Seed'deki "Sentetik Rüya" başlığı
const SENTETIK_RUYA = "00000000-0000-4000-8000-000000000001";

async function calistir(sorgu) {
  return onRequest({
    request: new Request(`https://latent.example/${sorgu}`),
    env: { SUPABASE_URL, SUPABASE_ANON_KEY, CF_CODE: "testkodu" },
    next: async () =>
      new Response(html, { headers: { "content-type": "text/html" } }),
  });
}

let hatali = 0;
function bekle(ad, kosul) {
  console.log(`  ${kosul ? "✓" : "✗"} ${ad}`);
  if (!kosul) hatali++;
}

console.log("OG prerender testi\n——————————————");

// 1) Paylaşılan başlık: meta'lar başlığa özel olmalı
const dolu = await (await calistir(`?b=${SENTETIK_RUYA}`)).text();
bekle("<title> başlık adını içeriyor", dolu.includes("<title>Sentetik Rüya — Latent</title>"));
bekle("og:title başlığa özel", /property="og:title" content="Sentetik Rüya — Latent"/.test(dolu));
bekle("og:description başlığın özeti", dolu.includes("veri merkezine"));
bekle("og:image CF kapağını gösteriyor", dolu.includes("ornek-uid-sentetik-ruya/thumbnails"));

// 2) Geçersiz id: genel sayfa değişmeden dönmeli
const genel = await (await calistir("?b=gecersiz")).text();
bekle("geçersiz id'de genel meta korunuyor", genel.includes("Latent — AI-made films"));

// 3) ?b= yoksa fonksiyon araya girmemeli
const duz = await (await calistir("")).text();
bekle("parametresiz istekte dokunulmamış HTML", duz === html);

if (hatali) {
  console.log(`\n${hatali} test başarısız.`);
  process.exit(1);
}
console.log("\nHepsi geçti.");
