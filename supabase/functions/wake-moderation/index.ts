// wake-moderation — ZAMANLANMIŞ keep-warm. Render free-tier moderation-service 15 dk boştan
// sonra UYUR; uykudan sonraki İLK sohbet mesajı forum-post'un 6sn timeout'unu aşan soğuk-başlatma
// yüzünden fail-closed ile reddedilir. Bu fonksiyon /health'i düzenli pingleyerek servisi uyanık
// tutar → moderasyon her zaman hızlı yanıt verir → chat gönderimi güvenilir olur.
// Moderasyon AKIŞINA / token mekanizmasına DOKUNMAZ; yalnız public /health'i pingler.
//
// Dağıtım: supabase functions deploy wake-moderation
// Zamanlama: Dashboard → Edge Functions → wake-moderation → Schedule, önerilen: */10 * * * *
//   (15 dk uyku eşiğinin ALTINDA olmalı → 10 dk güvenli). Secret: COMPUTE_SERVICE_URL (mevcut).
const cors = { "Content-Type": "application/json" };
const yanit = (g: unknown, s = 200) => new Response(JSON.stringify(g), { status: s, headers: cors });

Deno.serve(async (_req) => {
  const url = Deno.env.get("COMPUTE_SERVICE_URL");
  if (!url) return yanit({ ok: true, atlandi: "compute_url_yok" });
  try {
    const kontrol = new AbortController();
    const zaman = setTimeout(() => kontrol.abort(), 60000); // cold-start'a zaman tanı (60sn)
    const r = await fetch(`${url}/health`, { signal: kontrol.signal });
    clearTimeout(zaman);
    return yanit({ ok: true, health: r.status });
  } catch (e) {
    console.error("wake-moderation ping hatasi:", e);
    return yanit({ ok: false, hata: "ping" }, 200); // cron'u bozma; sonraki turda tekrar dener
  }
});
