// Supabase istemcisi — URL ve anon anahtar .env'den gelir (bkz. .env.example).
// .env doldurulmamışsa kabuk yine açılır; veri istekleri hata verir ve ekranlar
// "alınamadı" durumlarını gösterir (yerel geliştirme kolaylığı).
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL || "https://ornek-proje.supabase.co";
const anahtar = import.meta.env.VITE_SUPABASE_ANON_KEY || "ornek-anon-anahtar";

if (!import.meta.env.VITE_SUPABASE_URL) {
  console.warn("VITE_SUPABASE_URL tanımlı değil — .env dosyanı .env.example'a göre doldur.");
}

export const supabase = createClient(url, anahtar);
