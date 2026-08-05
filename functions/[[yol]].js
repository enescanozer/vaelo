// Cloudflare Pages Function — paylaşılan ?b=<id> bağlantıları için başlığa özel
// OG meta üretir (sosyal ağ kartları: ad + açıklama + kapak). Diğer tüm istekler
// statik dosyalara dokunmadan akar; hata durumunda her zaman genel sayfaya düşülür.
//
// CF Pages panelinde tanımlanacak ortam değişkenleri:
//   SUPABASE_URL, SUPABASE_ANON_KEY  (anon anahtar herkese açıktır, RLS korur)
//   CF_CODE                          (Cloudflare Stream hesap kodu — kapak için)
//
// Yerel doğrulama: npm run og:test  (çalışan yerel Supabase'e karşı)

const kacir = (metin) =>
  String(metin ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const baslikId = url.searchParams.get("b");

  // Yalnızca ?b='li sayfa (HTML) istekleri; varlıklar ve diğer her şey statik akışa
  if (!baslikId || request.method !== "GET" || url.pathname.includes(".")) {
    return next();
  }

  const cevap = await next(); // statik index.html
  const icerikTipi = cevap.headers.get("content-type") ?? "";
  if (!icerikTipi.includes("text/html")) return cevap;

  try {
    // UUID değilse sorguya gitme (gereksiz istek + enjeksiyon yüzeyi yok)
    if (!/^[0-9a-fA-F-]{36}$/.test(baslikId)) return cevap;

    const rest = await fetch(
      `${env.SUPABASE_URL}/rest/v1/titles?id=eq.${baslikId}&select=name,description,videos(cf_uid,status)`,
      {
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        },
      }
    );
    if (!rest.ok) return cevap;
    const [baslik] = await rest.json();
    if (!baslik) return cevap; // RLS: yayınlanmamış başlık burada da görünmez

    const ad = kacir(baslik.name);
    const aciklama = kacir(
      baslik.description ??
        "Films and series made entirely with AI. Always free to watch."
    );
    const onayliUid = (baslik.videos ?? []).find((v) => v.status === "approved")?.cf_uid;
    const kapak = onayliUid
      ? `https://customer-${env.CF_CODE}.cloudflarestream.com/${onayliUid}/thumbnails/thumbnail.jpg?time=2s&height=720`
      : null;

    let html = await cevap.text();
    html = html
      .replace(/<title>[^<]*<\/title>/, `<title>${ad} — Vaelo</title>`)
      .replace(
        /property="og:title"\s+content="[^"]*"/,
        `property="og:title" content="${ad} — Vaelo"`
      )
      .replace(
        /property="og:description"\s+content="[^"]*"/,
        `property="og:description" content="${aciklama}"`
      )
      .replace(
        /name="description"\s+content="[^"]*"/,
        `name="description" content="${aciklama}"`
      );
    if (kapak) {
      html = html.replace(
        "</head>",
        `<meta property="og:image" content="${kapak}" />\n</head>`
      );
    }

    return new Response(html, {
      status: cevap.status,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch {
    // Meta zenginleştirme asla sayfayı düşürmesin
    return cevap;
  }
}
