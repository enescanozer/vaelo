// stream-webhook — Cloudflare Stream webhook'u: video işlenip hazır olduğunda
// videos.status'u 'in_review' yapar VE moderasyon Tier 1'i tetikler. ASLA doğrudan
// 'approved' yapmaz; yayın kararı yalnızca admin/moderasyon boru hattından verilir.
//
// Akış:  Stream ready → in_review → moderate-tier1 (yalnız GERÇEK geçişte, duplicate-güvenli).
//
// Dağıtım (Cloudflare JWT gönderemeyeceği için JWT doğrulaması kapalı):
//   supabase functions deploy stream-webhook --no-verify-jwt
// Secret'lar:
//   supabase secrets set CF_WEBHOOK_SECRET=...   (Cloudflare webhook oluştururken verilen sır)
// Cloudflare tarafı: Stream → Webhooks → bu fonksiyonun URL'ini ekle.
import { createClient } from "npm:@supabase/supabase-js@2";
import { imzaGecerliMi, tier1Tetikle, tier1TetiklenmeliMi } from "./lib.ts";

Deno.serve(async (req) => {
  try {
    const govde = await req.text();
    if (!(await imzaGecerliMi(req, govde))) {
      return new Response("gecersiz imza", { status: 401 });
    }

    const veri = JSON.parse(govde);
    const uid: string | undefined = veri?.uid;
    const durum: string | undefined = veri?.status?.state;
    if (!uid) return new Response("uid yok", { status: 400 });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const servis = createClient(supabaseUrl, serviceKey);

    if (durum === "ready") {
      // Yalnızca henüz karara bağlanmamış (uploading/processing) kaydı incelemeye taşı.
      // .select("id") → GERÇEKTEN geçen satırları döndürür; duplicate/retry'de (zaten in_review)
      // 0 satır döner → tier1 tetiklenmez. Onaylı/reddedilmiş videoyu webhook geri döndüremez.
      const { data: guncellenen, error } = await servis
        .from("videos")
        .update({
          status: "in_review",
          duration_seconds: veri?.duration ?? 0,
        })
        .eq("cf_uid", uid)
        .in("status", ["uploading", "processing"])
        .select("id");
      if (error) {
        console.error("in_review güncellemesi başarısız:", error.message);
        return new Response("guncelleme hatasi", { status: 500 });
      }

      // Tier 1'i YALNIZCA gerçek geçişte tetikle (duplicate-güvenli). Tetikleme hatası
      // webhook'u düşürmez — zamanlanmış moderate-tier1 taraması kaçanları yakalar.
      const sayi = guncellenen?.length ?? 0;
      if (tier1TetiklenmeliMi(durum, sayi)) {
        await tier1Tetikle(supabaseUrl, serviceKey, guncellenen![0].id);
      }
    } else if (durum === "error") {
      // İşleme hatası: kayıt reddedilmiş sayılır, üretici yeniden yükler. (tier1 TETİKLENMEZ.)
      await servis
        .from("videos")
        .update({ status: "rejected" })
        .eq("cf_uid", uid)
        .in("status", ["uploading", "processing"]);
    }
    // diğer durumlar (inprogress vb.) sessizce geçilir

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("stream-webhook beklenmedik hata:", e);
    return new Response("beklenmedik hata", { status: 500 });
  }
});
