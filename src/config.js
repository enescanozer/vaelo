// Cloudflare Stream hesap kodu (customer-<KOD>.cloudflarestream.com).
// TEK yer burası — başka dosyaya sabitleme, gereken yerde buradan import et.
export const CF_CODE = "p5urunciefhqg37e";

// Gerçek kod girilmeden kapak URL'leri üretilmez: var olmayan alan adına giden
// istekler tarayıcıda askıda kalıp arayüzü ciddi yavaşlatıyordu (yerel geliştirme).
export const CF_KURULU = !CF_CODE.startsWith("CF_");
