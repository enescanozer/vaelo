// Canlıya çıkış öncesi kurulum kontrolü: eksikleri listeler, sıradaki adımı söyler.
//   çalıştır:  npm run kontrol
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const kok = join(dirname(fileURLToPath(import.meta.url)), "..");
const sorunlar = [];
const tamamlar = [];

// 1) .env ve zorunlu değişkenler
const envYolu = join(kok, ".env");
if (!existsSync(envYolu)) {
  sorunlar.push(".env yok — .env.example'ı kopyalayıp Supabase URL + anon anahtarını yaz.");
} else {
  const env = readFileSync(envYolu, "utf8");
  const eksik = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"].filter(
    (anahtar) => !new RegExp(`^${anahtar}=.+`, "m").test(env) || env.includes(`${anahtar}=https://PROJENIZ`)
  );
  if (eksik.length) sorunlar.push(`.env içinde doldurulmamış değişken: ${eksik.join(", ")}`);
  else tamamlar.push(".env dolu");
}

// 2) Cloudflare hesap kodu
const config = readFileSync(join(kok, "src", "config.js"), "utf8");
if (config.includes("CF_HESAP_KODUNUZ")) {
  sorunlar.push("src/config.js → CF_CODE hâlâ yer tutucu; Cloudflare hesap kodunu yaz.");
} else {
  tamamlar.push("CF_CODE tanımlı");
}

// 3) Migrations sql/ ile eşit mi (seed migration sayılmaz; supabase/seed.sql'e gider)
const sqlSayisi = readdirSync(join(kok, "sql")).filter(
  (a) => /^\d+_.*\.sql$/.test(a) && !a.includes("seed")
).length;
const migDizin = join(kok, "supabase", "migrations");
const migSayisi = existsSync(migDizin)
  ? readdirSync(migDizin).filter((a) => a.endsWith(".sql")).length
  : 0;
if (migSayisi !== sqlSayisi) {
  sorunlar.push(`migrations (${migSayisi}) ile sql/ (${sqlSayisi}) eşit değil — npm run db:sync çalıştır.`);
} else {
  tamamlar.push(`migrations güncel (${migSayisi} dosya + seed.sql)`);
}

// 4) Supabase projesine bağlı mı (supabase link .temp/project-ref üretir)
if (!existsSync(join(kok, "supabase", ".temp", "project-ref"))) {
  sorunlar.push("Supabase projesine bağlı değil — npx supabase login && npx supabase link --project-ref <ref>");
} else {
  tamamlar.push("Supabase projesine bağlı");
}

console.log("Latent kurulum kontrolü\n———————————————");
for (const satir of tamamlar) console.log(`  ✓ ${satir}`);
for (const satir of sorunlar) console.log(`  ✗ ${satir}`);

if (sorunlar.length === 0) {
  console.log(`\nHer şey hazır. Sıradaki adımlar:
  1. npx supabase db push                        (şema + RLS + fonksiyonlar)
  2. npx supabase functions deploy               (üç Edge Function)
  3. npx supabase secrets set CF_ACCOUNT_ID=... CF_API_TOKEN=... CF_WEBHOOK_SECRET=... RESEND_API_KEY=... MAIL_FROM="..." SITE_URL=...
  4. Cloudflare Stream → Webhooks → stream-webhook URL'ini ekle
  5. Dashboard → Edge Functions → notify-new-content → Schedule (*/15 * * * *)
  6. SQL Editor: update profiles set role='admin' where id='<uuid>';
  7. npm run build → dist/ klasörünü CF Pages ya da Vercel'e ver`);
} else {
  console.log(`\n${sorunlar.length} eksik var — önce bunları tamamla, sonra tekrar: npm run kontrol`);
  process.exitCode = 1;
}
