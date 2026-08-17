// set-nickname — kullanıcı takma adını doğrular, moderasyondan geçirir ve profiles'a yazar.
// Akış: kullanıcı JWT'siyle kimlik → biçim doğrulama (3-20, güvenli karakter) → Fly compute
// /text blocklist proxy'si → service role ile profiles.display_name + display_name_chosen=true.
// Tekillik (büyük/küçük harf duyarsız) DB partial unique index ile garanti (23505 → alınmış).
//
// Dağıtım: supabase functions deploy set-nickname
// Secret'lar: COMPUTE_SERVICE_URL, COMPUTE_SERVICE_TOKEN (moderate-tier1 ile aynı; opsiyonel —
//   tanımlı değilse moderasyon atlanır, biçim + tekillik yine uygulanır).
import { createClient } from "npm:@supabase/supabase-js@2";

const COMPUTE_URL = Deno.env.get("COMPUTE_SERVICE_URL");
const COMPUTE_TOKEN = Deno.env.get("COMPUTE_SERVICE_TOKEN");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const yanit = (g: unknown, s = 200) => new Response(JSON.stringify(g), { status: s, headers: cors });

// 3-20 karakter; harf (TR dahil) + rakam + alt çizgi. Kod istemciyle AYNI olmalı.
const BICIM = /^[A-Za-z0-9_ğüşıöçİĞÜŞÖÇ]{3,20}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const istemci = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await istemci.auth.getUser();
    if (!user) return yanit({ hata: "giris", kod: "giris" }, 401);

    const govde = await req.json().catch(() => ({}));
    const nick = String(govde?.nickname ?? "").trim();
    const lang = typeof govde?.lang === "string" ? govde.lang : "en";
    if (!BICIM.test(nick)) return yanit({ hata: "bicim", kod: "bicim" }, 400);

    // Moderasyon: Fly /text blocklist (yalandırılabilir compute). Yapılandırılmamışsa atla;
    // erişilemezse transient sayıp geçir (biçim + tekillik yine korur).
    if (COMPUTE_URL && COMPUTE_TOKEN) {
      try {
        const r = await fetch(`${COMPUTE_URL}/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${COMPUTE_TOKEN}` },
          body: JSON.stringify({ text: nick, lang }),
        });
        if (r.ok) {
          const m = await r.json();
          if (m?.blocked) return yanit({ hata: "moderasyon", kod: "moderasyon" }, 400);
        }
      } catch (_e) { /* compute erişilemedi → biçim/tekillik ile devam */ }
    }

    // Yaz (service role — RLS'i aşar, DB unique index tekilliği garantiler)
    const servis = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error } = await servis
      .from("profiles")
      .update({ display_name: nick, display_name_chosen: true })
      .eq("id", user.id);
    if (error) {
      if (error.code === "23505") return yanit({ hata: "alinmis", kod: "alinmis" }, 409);
      console.error("nickname yazılamadı:", error.message);
      return yanit({ hata: "sunucu", kod: "sunucu" }, 500);
    }
    return yanit({ ok: true, display_name: nick });
  } catch (e) {
    console.error("set-nickname beklenmedik hata:", e);
    return yanit({ hata: "sunucu", kod: "sunucu" }, 500);
  }
});
