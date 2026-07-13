// sql/ altındaki numaralı dosyaları supabase/migrations/ altına, Supabase CLI'ın
// beklediği zaman damgalı adlarla kopyalar. Kaynak TEK: sql/ — bu betik her
// çalıştırıldığında migrations yeniden üretilir (elle migration düzenleme).
//   çalıştır:  npm run db:sync   (sonra: npx supabase db push)
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const kok = join(dirname(fileURLToPath(import.meta.url)), "..");
const sqlDizin = join(kok, "sql");
const hedefDizin = join(kok, "supabase", "migrations");

// Deterministik taban damga: yeniden çalıştırmak aynı adları üretir (drift olmaz)
const TABAN = "20260709";

const dosyalar = readdirSync(sqlDizin)
  .filter((ad) => /^\d+_.*\.sql$/.test(ad))
  .sort();

if (dosyalar.length === 0) {
  console.error("sql/ altında numaralı .sql dosyası bulunamadı.");
  process.exit(1);
}

// Eski üretimi temizle ki silinen sql dosyası migrations'ta kalmasın
rmSync(hedefDizin, { recursive: true, force: true });
mkdirSync(hedefDizin, { recursive: true });

let migrationSayisi = 0;
for (const ad of dosyalar) {
  const [, sira, kalan] = ad.match(/^(\d+)_(.*)\.sql$/);
  const icerik = readFileSync(join(sqlDizin, ad), "utf8");

  // Örnek veri migration DEĞİLDİR: db push ile üretime gitmesin.
  // supabase/seed.sql yalnızca yerel `supabase db reset` sırasında uygulanır.
  if (kalan.includes("seed")) {
    writeFileSync(
      join(kok, "supabase", "seed.sql"),
      `-- Bu dosya sql/${ad} dosyasından üretildi — ELLE DÜZENLEME (npm run db:sync).\n-- Yalnızca yerel geliştirmede (supabase db reset) uygulanır; üretime GİTMEZ.\n\n${icerik}`
    );
    console.log(`sql/${ad}  →  supabase/seed.sql  (yalnızca yerel)`);
    continue;
  }

  const damga = `${TABAN}${sira.padStart(4, "0")}00`; // 14 haneli: YYYYMMDDHHMMSS
  const hedefAd = `${damga}_${kalan}.sql`;
  writeFileSync(
    join(hedefDizin, hedefAd),
    `-- Bu dosya sql/${ad} dosyasından üretildi — ELLE DÜZENLEME, sql/ altını değiştirip\n-- \`npm run db:sync\` çalıştır.\n\n${icerik}`
  );
  migrationSayisi++;
  console.log(`sql/${ad}  →  supabase/migrations/${hedefAd}`);
}

console.log(`\n${migrationSayisi} migration üretildi. Sonraki adım: npx supabase db push`);
