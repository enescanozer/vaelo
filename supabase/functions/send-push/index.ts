// send-push — Kuyruktaki bildirimleri (notifications.push_sent_at boş) kayıtlı cihazlara
// Expo Push API ile gönderir. Zamanlanmış çalışır (uygulama içi zil + e-posta ile aynı kuyruk).
//
// Dağıtım:   npx supabase functions deploy send-push
// Zamanlama: Dashboard → Edge Functions → send-push → Schedule (örn. */5 * * * *)
// Secret gerekmez (Expo Push API açık uçtur; SUPABASE_URL + SERVICE_ROLE_KEY gömülü).
import { createClient } from "npm:@supabase/supabase-js@2";

// Bildirim türüne göre push başlığı/gövdesi (dil: cihazda değil, kısa TR/EN nötr metin)
function icerik(kind: string): { title: string; body: string } {
  switch (kind) {
    case "art_eleme":
      return { title: "Vaelo · Tablo", body: "Voting is open — help pick this week's 50" };
    case "art_sergi":
      return { title: "Vaelo · Tablo", body: "This week's AI art exhibition is live" };
    case "yeni_bolum":
      return { title: "Vaelo", body: "New episode added to a title on your list" };
    default:
      return { title: "Vaelo", body: "New content is live" };
  }
}

Deno.serve(async () => {
  try {
    const servis = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Gönderilmemiş bildirimler (tek seferde en çok 200)
    const { data: bekleyen, error } = await servis
      .from("notifications")
      .select("id, user_id, kind")
      .is("push_sent_at", null)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    if (!bekleyen?.length) return yanit({ gonderilen: 0 });

    // İlgili kullanıcıların cihaz token'ları
    const kullanicilar = [...new Set(bekleyen.map((b) => b.user_id))];
    const { data: tokenlar } = await servis
      .from("push_tokens")
      .select("user_id, token")
      .in("user_id", kullanicilar);

    const tokenHaritasi = new Map<string, string[]>();
    for (const t of tokenlar ?? []) {
      const liste = tokenHaritasi.get(t.user_id) ?? [];
      liste.push(t.token);
      tokenHaritasi.set(t.user_id, liste);
    }

    // Expo mesajları: her bildirim → kullanıcının her cihazı
    const mesajlar: { to: string; title: string; body: string; data: unknown }[] = [];
    for (const b of bekleyen) {
      const cihazlar = tokenHaritasi.get(b.user_id) ?? [];
      const { title, body } = icerik(b.kind);
      for (const to of cihazlar) mesajlar.push({ to, title, body, data: { kind: b.kind } });
    }

    // Expo Push API'ye 100'lük gruplar hâlinde gönder
    let gonderilen = 0;
    for (let i = 0; i < mesajlar.length; i += 100) {
      const grup = mesajlar.slice(i, i + 100);
      if (!grup.length) continue;
      const cevap = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(grup),
      });
      if (cevap.ok) gonderilen += grup.length;
      else console.error("Expo push hatası:", await cevap.text());
    }

    // Token'ı olsun olmasın hepsini işaretle ki kuyruk büyümesin
    await servis
      .from("notifications")
      .update({ push_sent_at: new Date().toISOString() })
      .in("id", bekleyen.map((b) => b.id));

    return yanit({ gonderilen, bildirim: bekleyen.length });
  } catch (e) {
    console.error("send-push hatası:", e);
    return new Response("beklenmedik hata", { status: 500 });
  }
});

function yanit(govde: unknown, durum = 200) {
  return new Response(JSON.stringify(govde), {
    status: durum,
    headers: { "Content-Type": "application/json" },
  });
}
