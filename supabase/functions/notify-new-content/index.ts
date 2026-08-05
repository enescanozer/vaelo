// notify-new-content — Kuyruktaki bildirimleri (notifications.emailed_at boş olanları)
// kullanıcı başına gruplayıp Resend ile e-postalar. Zamanlanmış çalışır.
//
// Dağıtım:  supabase functions deploy notify-new-content
// Zamanlama: Supabase Dashboard → Edge Functions → notify-new-content → Schedule
//            (örn. her 15 dakikada: */15 * * * *)
// Secret'lar:
//   supabase secrets set RESEND_API_KEY=re_...
//   supabase secrets set MAIL_FROM="Vaelo <bildirim@alanadiniz.com>"
//   supabase secrets set SITE_URL=https://vaelo.example
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async () => {
  try {
    const servis = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Gönderilmemiş bildirimleri çek (tek seferde en çok 200)
    const { data: bekleyen, error } = await servis
      .from("notifications")
      .select("id, user_id, kind, titles(name), videos(name, season, episode)")
      .is("emailed_at", null)
      .order("user_id")
      .limit(200);
    if (error) throw error;
    if (!bekleyen?.length) {
      return new Response(JSON.stringify({ gonderilen: 0 }), { status: 200 });
    }

    // Kullanıcı başına grupla: tek e-postada tüm yeni bölümler
    const gruplar = new Map<string, typeof bekleyen>();
    for (const bildirim of bekleyen) {
      const liste = gruplar.get(bildirim.user_id) ?? [];
      liste.push(bildirim);
      gruplar.set(bildirim.user_id, liste);
    }

    const resendAnahtar = Deno.env.get("RESEND_API_KEY");
    const gonderen = Deno.env.get("MAIL_FROM") ?? "Vaelo <onboarding@resend.dev>";
    const siteUrl = Deno.env.get("SITE_URL") ?? "";
    let gonderilen = 0;

    for (const [userId, liste] of gruplar) {
      // E-posta adresi auth tarafında; yalnızca doğrulanmış adreslere gönder
      const { data: kullanici } = await servis.auth.admin.getUserById(userId);
      const email = kullanici?.user?.email;
      const dogrulanmis = !!kullanici?.user?.email_confirmed_at;

      if (resendAnahtar && email && dogrulanmis) {
        const satirlar = liste
          .map((b) => {
            // Tablo (art) bildirimleri: içerik başlığı yok, tür metnini kullan
            if (b.kind === "art_eleme")
              return "• Tablo: oylama açıldı — bu haftanın 50 eserini seçmeye yardım et";
            if (b.kind === "art_sergi")
              return "• Tablo: bu haftanın AI sanat sergisi yayında";
            const v = b.videos as { name?: string; season?: number; episode?: number } | null;
            const bolum =
              v?.season != null ? ` S${v.season}·B${v.episode}` : "";
            const ad = v?.name ? ` — ${v.name}` : "";
            return `• ${(b.titles as { name?: string } | null)?.name ?? "Yeni içerik"}${bolum}${ad}`;
          })
          .join("\n");

        const cevap = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendAnahtar}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: gonderen,
            to: email,
            subject: "Vaelo'te senin için yenilikler var",
            text: `Merhaba,\n\nVaelo'te senin için yeni gelişmeler:\n\n${satirlar}\n\nGörmek için: ${siteUrl}\n\nVaelo — yapay zekâ yapımı film, dizi ve sanat; her zaman ücretsiz.`,
          }),
        });
        if (cevap.ok) gonderilen++;
        else console.error("Resend hatası:", await cevap.text());
      }

      // Gönderilemese bile işaretle ki kuyruk sonsuza dek büyümesin
      // (adres yok/doğrulanmamış olanlara tekrar denemenin anlamı yok)
      await servis
        .from("notifications")
        .update({ emailed_at: new Date().toISOString() })
        .in("id", liste.map((b) => b.id));
    }

    return new Response(JSON.stringify({ gonderilen }), { status: 200 });
  } catch (e) {
    console.error("notify-new-content hatası:", e);
    return new Response("beklenmedik hata", { status: 500 });
  }
});
