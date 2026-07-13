-- 12_moderation.sql — AI ön-eleme alanları
-- 11'den sonra çalıştır. Değerleri yalnızca ai-screen Edge Function (service role)
-- yazar; admin panel kuyruğunda rozet olarak gösterilir. Nihai karar adminindir.

alter table public.videos
  add column ai_risk text check (ai_risk in ('low', 'medium', 'high')),
  add column ai_ozet text,
  add column ai_incelendi_at timestamptz;

-- Zamanlanmış tarama sorgusu için: değerlendirilmemiş inceleme kuyruğu
create index videos_ai_bekleyen_idx on public.videos (created_at)
  where status = 'in_review' and ai_incelendi_at is null;
