// forum-post — forum yazma yolunun TEK kapısı (moderasyon backend'de zorunlu).
// action: "thread" (yeni konu + ilk mesaj) | "reply" (cevap) | "edit" (kendi mesajını düzenle).
// Akış: kullanıcı JWT → aktif mute/ban kontrolü → /text moderasyon (context=forum) → service
// role ile insert/update. RLS'te client insert YOK; yazma yalnız buradan geçer.
//
// Dağıtım: supabase functions deploy forum-post
// Secret'lar (opsiyonel, moderate-tier1 ile aynı): COMPUTE_SERVICE_URL, COMPUTE_SERVICE_TOKEN.
//   Tanımlı değil / erişilemezse moderasyon atlanır (fail-open; set-nickname ile aynı davranış).
import { createClient } from "npm:@supabase/supabase-js@2";

const COMPUTE_URL = Deno.env.get("COMPUTE_SERVICE_URL");
const COMPUTE_TOKEN = Deno.env.get("COMPUTE_SERVICE_TOKEN");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const yanit = (g: unknown, s = 200) => new Response(JSON.stringify(g), { status: s, headers: cors });

const MAX = 5000; // mesaj üst sınırı (frontend ile AYNI)

// FORUM MODERASYONU = FAIL-CLOSED (nickname'den FARKLI; nickname fail-open kalır, ona dokunulmaz).
// Dönüş: "temiz" (yayınlanabilir) | "blocked" (içerik reddi) | "unavailable" (servis yok/hata/
// timeout/secret yok → mesaj REDDEDİLİR). Kullanıcıya teknik ayrıntı/terms sızdırılmaz.
type ModSonuc = "temiz" | "blocked" | "unavailable";
async function moderasyon(metin: string, lang: string): Promise<ModSonuc> {
  if (!COMPUTE_URL || !COMPUTE_TOKEN) return "unavailable"; // yapılandırılmamış → reddet
  try {
    const kontrol = new AbortController();
    const zaman = setTimeout(() => kontrol.abort(), 6000); // timeout → unavailable
    const r = await fetch(`${COMPUTE_URL}/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${COMPUTE_TOKEN}` },
      body: JSON.stringify({ text: metin, lang, context: "forum" }),
      signal: kontrol.signal,
    });
    clearTimeout(zaman);
    if (!r.ok) return "unavailable"; // servis hatası → reddet
    const m = await r.json();
    return m?.blocked ? "blocked" : "temiz";
  } catch (_e) {
    return "unavailable"; // erişilemedi/timeout → reddet
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const istemci = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await istemci.auth.getUser();
    if (!user) return yanit({ hata: "giris", kod: "giris" }, 401);

    const g = await req.json().catch(() => ({}));
    const action = g?.action;
    const content = String(g?.content ?? "").trim();
    const lang = typeof g?.lang === "string" ? g.lang : "en";
    const isSpoiler = !!g?.is_spoiler;
    if (!["thread", "reply", "edit", "sohbet", "sohbet_duzenle"].includes(action)) return yanit({ hata: "action", kod: "action" }, 400);
    if (!content || content.length > MAX) return yanit({ hata: "bicim", kod: "bicim" }, 400);

    const servis = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Aktif mute/ban → yazma yok
    const { data: yaptirim } = await servis.rpc("aktif_yaptirim", { p_user: user.id });
    if (yaptirim === "ban") return yanit({ hata: "banned", kod: "banned" }, 403);
    if (yaptirim === "mute") return yanit({ hata: "muted", kod: "muted" }, 403);

    // Moderasyon (thread'de başlık + içerik birlikte taranır) — FAIL-CLOSED
    const baslik = String(g?.baslik ?? "").trim();
    const taranan = action === "thread" ? `${baslik}\n${content}` : content;
    const mod = await moderasyon(taranan, lang);
    if (mod === "blocked") return yanit({ hata: "moderasyon", kod: "moderasyon" }, 400);
    if (mod === "unavailable") return yanit({ hata: "gonderilemedi", kod: "gonderilemedi" }, 503);
    // mod === "temiz" → devam

    // ————— Canlı sohbet mesajı (düz akış; forum thread'lerinden AYRI) —————
    if (action === "sohbet") {
      const oda = String(g?.oda ?? "").trim();
      // Oda anahtarı biçimi: 'ep:<uuid>' | 'title:<uuid>' — serbest metin kabul edilmez.
      if (!/^(ep|title):[0-9a-fA-F-]{36}$/.test(oda)) return yanit({ hata: "bicim", kod: "bicim" }, 400);
      // Oda kilidi → yeni mesaj yok (moderasyon durumu)
      const { data: odaDurum } = await servis.from("sohbet_odalari").select("locked").eq("oda", oda).maybeSingle();
      if (odaDurum?.locked) return yanit({ hata: "kilitli", kod: "kilitli" }, 403);
      // nickname: herkese açık ad (üretici rozetiyle AYNI display_name) — service role profiles okur
      const { data: pr } = await servis.from("profiles").select("display_name").eq("id", user.id).single();
      const nickname = String(pr?.display_name || "user").slice(0, 40);

      // ——— Reply: parent AYNI odada + görünür olmalı; preview (nickname+özet) DENORMALİZE edilir
      // (realtime payload self-contained; parent sonradan silinse de önizleme korunur). Geçersizse yok sayılır.
      let replyTo: string | null = null, replyNick: string | null = null, replyOzet: string | null = null;
      const rid = String(g?.reply_to ?? "").trim();
      if (/^[0-9a-fA-F-]{36}$/.test(rid)) {
        const { data: p } = await servis.from("sohbet_mesajlari")
          .select("id, oda, nickname, mesaj, status, deleted_at").eq("id", rid).maybeSingle();
        if (p && p.oda === oda && p.status === "visible" && !p.deleted_at) {
          replyTo = p.id; replyNick = p.nickname; replyOzet = String(p.mesaj || "").slice(0, 140);
        }
      }

      // ——— Mention: yalnız GERÇEK kullanıcı id'leri saklanır (geçersiz mention edilemez).
      const hamMentions = Array.isArray(g?.mentions) ? g.mentions.slice(0, 20).filter((x: unknown) => typeof x === "string" && /^[0-9a-fA-F-]{36}$/.test(x)) : [];
      let mentions: string[] = [];
      if (hamMentions.length) {
        const { data: gecerli } = await servis.from("profiles").select("id").in("id", hamMentions);
        mentions = (gecerli ?? []).map((r: { id: string }) => r.id);
      }

      const { data: row, error } = await servis.from("sohbet_mesajlari")
        .insert({ oda, user_id: user.id, nickname, mesaj: content, is_spoiler: isSpoiler,
                  reply_to: replyTo, reply_nickname: replyNick, reply_ozet: replyOzet, mentions })
        .select("id, oda, user_id, nickname, mesaj, is_spoiler, reply_to, reply_nickname, reply_ozet, mentions, created_at").single();
      if (error) { console.error(error.message); return yanit({ hata: "sunucu", kod: "sunucu" }, 500); }
      // sohbet_getir RPC şekliyle uyum: yeni mesajda beğeni 0 (optimistik + realtime tutarlı)
      return yanit({ ok: true, mesaj: { ...row, begeni_sayisi: 0, benim_begenim: false } });
    }

    // ————— Sohbet mesajını DÜZENLE (yalnız kendi; yeni metin yukarıda moderasyondan GEÇTİ) —————
    if (action === "sohbet_duzenle") {
      const mid = String(g?.id ?? "").trim();
      if (!/^[0-9a-fA-F-]{36}$/.test(mid)) return yanit({ hata: "bicim", kod: "bicim" }, 400);
      // Yalnız KENDİ, görünür, silinmemiş mesajın METNİ güncellenir (spoiler/reply/mention KORUNUR).
      const { data: upd, error } = await servis.from("sohbet_mesajlari")
        .update({ mesaj: content })
        .eq("id", mid).eq("user_id", user.id).eq("status", "visible").is("deleted_at", null)
        .select("id, oda, user_id, nickname, mesaj, is_spoiler, reply_to, reply_nickname, reply_ozet, mentions, created_at");
      if (error) { console.error(error.message); return yanit({ hata: "sunucu", kod: "sunucu" }, 500); }
      if (!upd || upd.length === 0) return yanit({ hata: "yetki", kod: "yetki" }, 403);
      return yanit({ ok: true, mesaj: { ...upd[0], begeni_sayisi: 0, benim_begenim: true } });
    }

    if (action === "thread") {
      const titleId = g?.title_id;
      const episodeId = g?.episode_id ?? null;
      if (!titleId || !baslik) return yanit({ hata: "bicim", kod: "bicim" }, 400);
      // Yalnız yayınlanmış başlıkta konu açılır
      const { data: t } = await servis.from("titles").select("id, status").eq("id", titleId).single();
      if (!t || t.status !== "published") return yanit({ hata: "baslik_yok", kod: "baslik_yok" }, 400);
      const { data: th, error: e1 } = await servis.from("forum_threads")
        .insert({ title_id: titleId, episode_id: episodeId, user_id: user.id, baslik })
        .select("id").single();
      if (e1) { console.error(e1.message); return yanit({ hata: "sunucu", kod: "sunucu" }, 500); }
      const { data: p, error: e2 } = await servis.from("forum_posts")
        .insert({ thread_id: th.id, user_id: user.id, content, is_spoiler: isSpoiler })
        .select("id").single();
      if (e2) { console.error(e2.message); return yanit({ hata: "sunucu", kod: "sunucu" }, 500); }
      return yanit({ ok: true, thread_id: th.id, post_id: p.id });
    }

    if (action === "reply") {
      const threadId = g?.thread_id;
      const parentId = g?.parent_id ?? null;
      if (!threadId) return yanit({ hata: "bicim", kod: "bicim" }, 400);
      const { data: th } = await servis.from("forum_threads")
        .select("id, status, locked").eq("id", threadId).single();
      if (!th || th.status !== "visible") return yanit({ hata: "konu_yok", kod: "konu_yok" }, 400);
      if (th.locked) return yanit({ hata: "kilitli", kod: "kilitli" }, 403);
      const { data: p, error } = await servis.from("forum_posts")
        .insert({ thread_id: threadId, user_id: user.id, parent_id: parentId, content, is_spoiler: isSpoiler })
        .select("id").single();
      if (error) { console.error(error.message); return yanit({ hata: "sunucu", kod: "sunucu" }, 500); }
      return yanit({ ok: true, post_id: p.id });
    }

    // action === "edit" — yalnız kendi, silinmemiş mesaj
    const postId = g?.post_id;
    if (!postId) return yanit({ hata: "bicim", kod: "bicim" }, 400);
    const { data: upd, error } = await servis.from("forum_posts")
      .update({ content, is_spoiler: isSpoiler, updated_at: new Date().toISOString() })
      .eq("id", postId).eq("user_id", user.id).is("deleted_at", null).eq("status", "visible")
      .select("id");
    if (error) { console.error(error.message); return yanit({ hata: "sunucu", kod: "sunucu" }, 500); }
    if (!upd || upd.length === 0) return yanit({ hata: "yetki", kod: "yetki" }, 403);
    return yanit({ ok: true, post_id: postId });
  } catch (e) {
    console.error("forum-post beklenmedik hata:", e);
    return yanit({ hata: "sunucu", kod: "sunucu" }, 500);
  }
});
