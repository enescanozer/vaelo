# Vaelo Moderation Compute Service (Fly.io)

Tier 1 medya işleme. Supabase Edge Functions / Cloudflare Workers ffmpeg/GPU/ağır ikili
çalıştıramaz; kare çıkarma + NSFW/şiddet sınıflandırma **burada** yapılır. Edge Function
yalnız orkestrasyon eder ve bu servisi HTTP ile çağırır.

## Ne yapar
`POST /tier1` → `{ video_id, cf_uid?, source_url?, duration_seconds?, lang, text }`
1. **Blocklist** (TR+EN, `blocklists/`) — kelime-sınırlı regex.
2. **Perspective API** — toksisite/hakaret/tehdit/kimlik-saldırısı (TR düşük güven).
3. **Kare örnekleme** (Stream thumbnail API ya da ffmpeg sahne-değişimi, 8–15 kare) →
   **NSFW/şiddet sınıflandırıcı** (transformers, CPU).

Dönüş: `{ tier1_scores{...}, flagged_timestamps[] }`. **Karar (kısa devre) Edge Function'da.**

## ⚠️ Cloudflare Stream ön koşulu
Kare kaynağı Stream thumbnail API'sine (`cf_uid`) ya da `source_url`'e bağlıdır. **Stream
henüz entegre değil** → `cf_uid` yokken ve `source_url` yokken kare listesi **boş** döner
(`frames_available=false`). Bu durumda Edge Function görsel-tabanlı otomatik onay VERMEZ.
Stream bağlanınca kod değişmeden devreye girer (bkz. `frames.py`).

## Kimlik doğrulama
Paylaşılan bearer token: istekte `Authorization: Bearer $COMPUTE_SERVICE_TOKEN`. Aynı değer
hem Fly secret hem Supabase secret'ta. Servis token'ı doğrulamayan isteği 401 ile reddeder.

## Deploy
```bash
fly launch --no-deploy          # fly.toml zaten var
fly secrets set COMPUTE_SERVICE_TOKEN=$(openssl rand -hex 32)
fly secrets set PERSPECTIVE_API_KEY=...    # Google Cloud → Perspective API
fly secrets set CF_CODE=...                # Cloudflare Stream hesap kodu (Stream bağlanınca)
# opsiyonel: NSFW_MODEL / VIOLENCE_MODEL (HF model id override)
fly deploy
```
Supabase tarafında aynı token + servis URL'i:
```bash
npx supabase secrets set COMPUTE_SERVICE_URL=https://vaelo-moderation.fly.dev
npx supabase secrets set COMPUTE_SERVICE_TOKEN=<yukarıdakiyle aynı>
```

## Modeller
- NSFW: `Falconsai/nsfw_image_detection` (ViT). Değiştir: `NSFW_MODEL` env.
- Şiddet: `jaranohaal/vit-base-violence-detection` (opsiyonel). Değiştir: `VIOLENCE_MODEL`.
Daha küçük imaj için ileride `onnxruntime` + kuantize model'e geçilebilir.
