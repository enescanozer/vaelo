-- Bu dosya sql/24_moderation_pipeline.sql dosyasından üretildi — ELLE DÜZENLEME, sql/ altını değiştirip
-- `npm run db:sync` çalıştır.

-- 24_moderation_pipeline.sql — Katmanlı içerik moderasyon boru hattı (video yükleme)
--
-- Tier 1 (TÜM yüklemeler, ucuz): keyword/regex blocklist + Perspective API (toksisite) +
--   sahne-değişimi kare örneklemesi → self-hosted NSFW/şiddet sınıflandırıcı (compute servisi).
-- Kısa devre: yüksek sinyal → REJECTED; hepsi düşük (+ TR blocklist temiz) → APPROVED; aksi → Tier 2.
-- Tier 2 (~%10-20 belirsiz): Claude Haiku 4.5, YALNIZ işaretli kareler, Batch API + prompt cache.
--
-- 4-kategori skor (0..1): nudity / violence / hate_politics / profanity.
-- Eylem eşikleri (DEĞİŞTİRME): APPROVED <0.40 · MANUAL_REVIEW 0.40–0.85 · REJECTED ≥0.85.
-- final_action yalnız APPROVED/REJECTED'te videos.status'u günceller; MANUAL_REVIEW → Panel kuyruğu.
--
-- ÇALIŞTIRMA: sql/ → migration (npm run db:sync) ya da SQL Editor'e yapıştır.

create type moderation_status as enum ('pending', 'processing', 'complete');

create table public.moderation_results (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  -- Tier 1 ham sinyaller: {nudity,violence,hate_politics,profanity,toxicity,
  --   keyword_hit(bool), keyword_terms[], perspective_lang, frames_sampled(int)}
  tier1_scores jsonb,
  tier1_verdict text check (tier1_verdict in ('approved', 'rejected', 'escalate')),
  needs_tier2 boolean not null default false,
  -- Tier 2 (Claude) sonucu — Tier 2 çalışana dek null; 4-kategori 0..1
  tier2_scores jsonb,
  -- Nihai eylem: APPROVED | MANUAL_REVIEW | REJECTED (pending iken null)
  final_action text check (final_action in ('APPROVED', 'MANUAL_REVIEW', 'REJECTED')),
  -- İşaretli kareler/aralıklar: [{ "t": 42.0, "reason": "nudity" }, ...]
  flagged_timestamps jsonb not null default '[]'::jsonb,
  reasoning text,
  status moderation_status not null default 'pending',
  batch_id text, -- Anthropic Message Batch id (Tier 2 kuyruğa alınınca)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (video_id)
);

create index moderation_results_video_idx on public.moderation_results (video_id);
-- Cron'un çekeceği iş kuyrukları: Tier 2 bekleyenler + işlemde olanlar
create index moderation_results_kuyruk_idx on public.moderation_results (status)
  where needs_tier2 and status in ('pending', 'processing');

-- ————— RLS —————
alter table public.moderation_results enable row level security;
-- Yetkili (admin/moderatör) Panel'de MANUAL_REVIEW kuyruğunu okur.
create policy "moderation: yetkili okur" on public.moderation_results
  for select using (is_moderator());
-- YAZMA yalnızca service_role (Edge Functions) — istemciden insert/update YOK.

-- updated_at otomatik dokunuş
create or replace function public.moderation_touch()
returns trigger language plpgsql
set search_path = public
as $$ begin new.updated_at = now(); return new; end; $$;

create trigger moderation_results_touch
  before update on public.moderation_results
  for each row execute function public.moderation_touch();

-- ————— Gözlemlenebilirlik / maliyet —————
-- Kaç yükleme Tier 1'de çözüldü vs Tier 2'ye tırmandı (eşik ayarı + maliyet takibi).
-- security_invoker: alttaki tablo RLS'ine uyar (yalnız yetkili görür). PG15+ (Supabase).
create view public.moderation_tier_stats
  with (security_invoker = true)
as
select
  date_trunc('day', created_at) as gun,
  count(*) as toplam,
  count(*) filter (where not needs_tier2) as tier1_cozuldu,
  count(*) filter (where needs_tier2) as tier2_tirmandi,
  round(
    100.0 * count(*) filter (where needs_tier2) / greatest(count(*), 1), 1
  ) as tier2_yuzde,
  count(*) filter (where final_action = 'APPROVED') as onaylandi,
  count(*) filter (where final_action = 'REJECTED') as reddedildi,
  count(*) filter (where final_action = 'MANUAL_REVIEW') as manuel_kuyruk
from public.moderation_results
group by 1
order by 1 desc;
