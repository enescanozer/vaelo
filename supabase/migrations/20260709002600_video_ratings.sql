-- Bu dosya sql/26_video_ratings.sql dosyasından üretildi — ELLE DÜZENLEME, sql/ altını değiştirip
-- `npm run db:sync` çalıştır.

-- 26_video_ratings.sql — İzleyici 1–10 halk oylaması (IMDb tarzı) — video başına.
-- contest_votes örüntüsü: bir kullanıcı bir video = tek oy (PK), değiştirilebilir (upsert).
-- Ham satırlar HERKESE AÇIK DEĞİL (kim ne verdi gizli); public gösterim aggregate RPC ile.

create table public.video_ratings (
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  puan int not null check (puan between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (video_id, user_id) -- bir kullanıcı bir video: tek oy
);

alter table public.video_ratings enable row level security;

-- Kullanıcı YALNIZ kendi oyunu okur/yazar/günceller (auth.uid()); başkasının oyunu göremez.
create policy "puan: kendi oyunu okur" on public.video_ratings
  for select using (user_id = auth.uid());
create policy "puan: kendi adina verir" on public.video_ratings
  for insert with check (user_id = auth.uid());
create policy "puan: kendi oyunu gunceller" on public.video_ratings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- updated_at otomatik (oy değişince)
create or replace function public.video_ratings_touch()
returns trigger language plpgsql
set search_path = public
as $$ begin new.updated_at = now(); return new; end; $$;

create trigger video_ratings_touch
  before update on public.video_ratings
  for each row execute function public.video_ratings_touch();

-- ————— Public aggregate (contest_results örüntüsü) —————
-- ortalama (1 ondalık) + oy_sayisi. Anon-callable; ham satır ifşa etmez.
create or replace function public.video_puan_ozet(p_video uuid)
returns table (ortalama numeric, oy_sayisi bigint)
language sql
stable
security definer
set search_path = public
as $$
  select round(avg(puan)::numeric, 1) as ortalama, count(*)::bigint as oy_sayisi
  from public.video_ratings
  where video_id = p_video;
$$;
grant execute on function public.video_puan_ozet(uuid) to anon, authenticated;
