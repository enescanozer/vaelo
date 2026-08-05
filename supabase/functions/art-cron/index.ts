// art-cron — "Tablo" haftalık döngüsünü UTC 00:00 takvimine göre ilerletir.
// Tüm mantık SQL'de (art_lifecycle_ilerlet); bu fonksiyon yalnız onu service_role ile
// çağıran ince bir tetikleyicidir. İdempotent: sık çağrılırsa yalnız gerekli geçişi yapar.
//
// Dağıtım:   npx supabase functions deploy art-cron
// Zamanlama (Dashboard → Edge Functions → art-cron → Schedule) — hepsi UTC:
//   Cuma günü sık (turların 50'ye inmesi için):  0 */2 * * 5   (Cuma her 2 saatte)
//   Gün başı geçişleri (eleme başlat / sergiye al / hafta kapat / yeni hafta):  0 0 * * *
//   Basit tercih: hepsini kapsayan tek zamanlama →  0 */2 * * *  (her 2 saatte, her gün)
//
// Not: Ürün kararına göre bu fonksiyon PROD'da zamanlanır. Manuel admin kontrolü
// (AdminPanel/Tablo) her zaman elde kalır; ikisi de aynı SQL geçişlerini kullanır.
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async () => {
  try {
    const servis = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data, error } = await servis.rpc("art_lifecycle_ilerlet");
    if (error) throw error;
    return new Response(JSON.stringify({ sonuc: data }), { status: 200 });
  } catch (e) {
    console.error("art-cron hatası:", e);
    return new Response("beklenmedik hata", { status: 500 });
  }
});
