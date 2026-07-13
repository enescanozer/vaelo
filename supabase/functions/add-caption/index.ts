// add-caption — Üreticinin bir bölüme WebVTT alt yazı yüklemesi. VTT metnini
// Cloudflare Stream captions API'sine (dil başına) gönderir ve videos.captions
// dizisine dili ekler. Alt yazı DOSYASI CF'de tutulur; oynatıcıda CC otomatik gelir.
//
// Dağıtım:  supabase functions deploy add-caption
// Secret'lar: CF_ACCOUNT_ID, CF_API_TOKEN (create-upload ile aynı)
import { createClient } from "npm:@supabase/supabase-js@2";

const corsBasliklar = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const yanit = (govde: unknown, durum = 200) =>
  new Response(JSON.stringify(govde), { status: durum, headers: corsBasliklar });

// Basit VTT doğrulaması: WEBVTT başlığıyla başlamalı
const vttGecerli = (metin: string) => metin.trimStart().startsWith("WEBVTT");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsBasliklar });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    // 1) Kullanıcıyı doğrula (istemcinin JWT'siyle)
    const istemci = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const {
      data: { user },
    } = await istemci.auth.getUser();
    if (!user) return yanit({ hata: "Giriş gerekli" }, 401);

    const { video_id, lang, vtt } = await req.json();
    if (!video_id || !lang || !vtt) return yanit({ hata: "video_id, lang, vtt zorunlu" }, 400);
    if (!/^[a-z]{2}(-[a-z]{2})?$/i.test(lang)) return yanit({ hata: "Geçersiz dil kodu" }, 400);
    if (!vttGecerli(vtt)) return yanit({ hata: "Dosya WEBVTT ile başlamalı" }, 400);

    // 2) Bölüm gerçekten bu üreticiye mi ait? (service role ile kontrol)
    const servis = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: video } = await servis
      .from("videos")
      .select("id, cf_uid, creator_id, captions")
      .eq("id", video_id)
      .single();
    if (!video || video.creator_id !== user.id) {
      return yanit({ hata: "Bu bölüme alt yazı ekleme yetkin yok" }, 403);
    }
    if (!video.cf_uid) return yanit({ hata: "Video henüz Cloudflare'de hazır değil" }, 409);

    // 3) Cloudflare Stream'e alt yazıyı yükle (dil başına, multipart)
    const form = new FormData();
    form.append("file", new Blob([vtt], { type: "text/vtt" }), `${lang}.vtt`);
    const cfCevap = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${Deno.env.get("CF_ACCOUNT_ID")}/stream/${video.cf_uid}/captions/${lang}`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${Deno.env.get("CF_API_TOKEN")}` },
        body: form,
      }
    );
    const cf = await cfCevap.json();
    if (!cf.success) {
      console.error("Cloudflare caption hatası:", JSON.stringify(cf.errors));
      return yanit({ hata: "Cloudflare alt yazıyı kabul etmedi" }, 502);
    }

    // 4) videos.captions dizisine dili ekle (tekrarsız)
    const diller = Array.from(new Set([...(video.captions ?? []), lang]));
    await servis.from("videos").update({ captions: diller }).eq("id", video.id);

    return yanit({ ok: true, captions: diller });
  } catch (e) {
    console.error("add-caption beklenmedik hata:", e);
    return yanit({ hata: "Beklenmedik hata" }, 500);
  }
});
