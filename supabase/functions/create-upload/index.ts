// create-upload — Cloudflare Stream'den imzalı doğrudan yükleme URL'i alır ve
// videos tablosuna 'uploading' durumunda kayıt açar. Video bu sunucudan GEÇMEZ;
// istemci dönen uploadURL'e dosyayı doğrudan gönderir.
//
// Dağıtım:  supabase functions deploy create-upload
// Secret'lar (ASLA istemciye koyma):
//   supabase secrets set CF_ACCOUNT_ID=... CF_API_TOKEN=...
import { createClient } from "npm:@supabase/supabase-js@2";

const corsBasliklar = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const yanit = (govde: unknown, durum = 200) =>
  new Response(JSON.stringify(govde), { status: durum, headers: corsBasliklar });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsBasliklar });
  }

  try {
    // 1) Kullanıcıyı doğrula (istemcinin JWT'siyle)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const istemci = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const {
      data: { user },
    } = await istemci.auth.getUser();
    if (!user) return yanit({ hata: "Giriş gerekli" }, 401);

    const { title_id, name, season, episode, icerik_tipi } = await req.json();
    if (!title_id) return yanit({ hata: "title_id zorunlu" }, 400);
    // Yalnız izinli değerler; bilinmeyen → 'ana' (güvenli varsayılan)
    const tip = icerik_tipi === "yapim" ? "yapim" : "ana";

    // 2) Başlık gerçekten bu kullanıcıya mı ait? (service role ile kontrol)
    const servis = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: baslik } = await servis
      .from("titles")
      .select("id, creator_id")
      .eq("id", title_id)
      .single();
    if (!baslik || baslik.creator_id !== user.id) {
      return yanit({ hata: "Bu başlığa yükleme yetkin yok" }, 403);
    }

    // 3) Cloudflare Stream'den tek kullanımlık doğrudan yükleme URL'i al
    const cfCevap = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${Deno.env.get("CF_ACCOUNT_ID")}/stream/direct_upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("CF_API_TOKEN")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          maxDurationSeconds: 14400, // 4 saat üst sınır
          creator: user.id,
          meta: { title_id, yukleyen: user.id },
        }),
      }
    );
    const cf = await cfCevap.json();
    if (!cf.success) {
      console.error("Cloudflare hatası:", JSON.stringify(cf.errors));
      return yanit({ hata: "Cloudflare yükleme URL'i alınamadı" }, 502);
    }

    // 4) videos kaydını 'uploading' olarak aç (service role — istemcide insert ilkesi yok)
    const { error: kayitHata } = await servis.from("videos").insert({
      title_id,
      creator_id: user.id,
      name: name ?? null,
      season: tip === "yapim" ? null : (season ?? null),
      episode: tip === "yapim" ? null : (episode ?? null),
      icerik_tipi: tip,
      cf_uid: cf.result.uid,
      status: "uploading",
    });
    if (kayitHata) {
      console.error("videos kaydı açılamadı:", kayitHata.message);
      return yanit({ hata: "Video kaydı açılamadı" }, 500);
    }

    return yanit({ uploadURL: cf.result.uploadURL, uid: cf.result.uid });
  } catch (e) {
    console.error("create-upload beklenmedik hata:", e);
    return yanit({ hata: "Beklenmedik hata" }, 500);
  }
});
