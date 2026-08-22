-- 36 — Panelden değiştirilebilir öneri algoritması (Strateji Deseni, SQL uyarlaması).
-- "ince istemci, tek backend": stratejiler SQL fonksiyonu; istemci yalnız oneri_getir çağırır.
-- Bu pakette 2 strateji aktif: 'kisisel' (tür affinitesi) + 'trending' (izlenme hızı + oy).
-- 'collaborative' değeri ileride kullanılmak üzere kabul edilir ama henüz trending'e düşer.

-- ————— Aktif strateji konfigürasyonu (tek satır) —————
create table if not exists public.recommendation_config (
  id int primary key default 1,
  active_strategy text not null default 'kisisel'
    check (active_strategy in ('kisisel', 'trending', 'collaborative')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint tek_satir check (id = 1)
);
insert into public.recommendation_config (id, active_strategy) values (1, 'kisisel')
  on conflict (id) do nothing;
alter table public.recommendation_config enable row level security;
drop policy if exists "oneri_config: herkes okur" on public.recommendation_config;
create policy "oneri_config: herkes okur" on public.recommendation_config for select using (true);
-- doğrudan yazma yok; yalnız set_oneri_strateji (security definer) günceller

-- ————— Sunulan stratejiyi logla (A/B + performans analizi için) —————
create table if not exists public.recommendation_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  strategy text not null,
  created_at timestamptz not null default now()
);
create index if not exists recommendation_log_at_idx on public.recommendation_log (created_at);
alter table public.recommendation_log enable row level security;
drop policy if exists "oneri_log: admin okur" on public.recommendation_log;
create policy "oneri_log: admin okur" on public.recommendation_log for select using (public.is_admin());

-- ————— Strateji: TRENDING (izlenme hızı + oy) —————
-- Hacker News tarzı: son 14 günün izlenmeleri 48s yarı-ömürle üstel sönümlenir + oy log-boost.
create or replace function public.oneri_trending(p_top int default 12)
returns table (title_id uuid, score numeric)
language sql
stable
security definer
set search_path = public
as $$
  select t.id,
    coalesce(sum(power(0.5, extract(epoch from (now() - w.created_at)) / 3600.0 / 48.0)), 0)
    + coalesce((select ln(1 + count(*)) * 2 from public.contest_votes cv where cv.title_id = t.id), 0)
      as score
  from public.titles t
  left join public.videos v on v.title_id = t.id and v.status = 'approved'
  left join public.watch_events w on w.video_id = v.id and w.created_at > now() - interval '14 days'
  where t.status = 'published' and not coalesce(t.is_test, false)
  group by t.id
  order by score desc nulls last, max(t.published_at) desc
  limit p_top;
$$;

-- ————— Strateji: KİŞİSEL (tür affinitesi) —————
-- Kullanıcının en çok izlediği ilk 3 türdeki, henüz izlemediği yayınlanmış başlıklar.
create or replace function public.oneri_kisisel(p_user uuid, p_top int default 12)
returns table (title_id uuid, score numeric)
language sql
stable
security definer
set search_path = public
as $$
  with sevilen as (
    select t.genre, count(*)::numeric c
    from public.watch_events w
    join public.videos v on v.id = w.video_id
    join public.titles t on t.id = v.title_id
    where w.user_id = p_user and t.genre is not null and not coalesce(t.is_test, false)
    group by t.genre
    order by c desc
    limit 3
  ),
  izlenen as (
    select distinct v.title_id
    from public.watch_events w
    join public.videos v on v.id = w.video_id
    where w.user_id = p_user
  )
  select t.id, sv.c as score
  from public.titles t
  join sevilen sv on sv.genre = t.genre
  where t.status = 'published' and not coalesce(t.is_test, false)
    and t.id not in (select title_id from izlenen)
  order by sv.c desc, t.published_at desc
  limit p_top;
$$;

-- ————— Dağıtıcı: aktif stratejiyi uygula + logla + boşsa trending'e düş —————
create or replace function public.oneri_getir(p_user uuid default null, p_top int default 12)
returns table (title_id uuid, score numeric)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  strat text;
begin
  select active_strategy into strat from public.recommendation_config where id = 1;
  strat := coalesce(strat, 'trending');

  -- Hangi strateji sunuldu (best-effort log; hata olursa öneri yine döner)
  begin
    insert into public.recommendation_log (user_id, strategy) values (p_user, strat);
  exception when others then null;
  end;

  if strat = 'kisisel' and p_user is not null then
    return query select * from public.oneri_kisisel(p_user, p_top);
    if found then return; end if;  -- boşsa (soğuk başlangıç) trending'e düş
  end if;

  -- Varsayılan / collaborative (henüz yok) / kullanıcı yok → trending
  return query select * from public.oneri_trending(p_top);
end;
$$;

-- ————— Admin: aktif stratejiyi değiştir —————
create or replace function public.set_oneri_strateji(p_strat text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'yalnizca admin';
  end if;
  if p_strat not in ('kisisel', 'trending', 'collaborative') then
    raise exception 'gecersiz strateji';
  end if;
  update public.recommendation_config
    set active_strategy = p_strat, updated_at = now(), updated_by = auth.uid()
    where id = 1;
end;
$$;

-- ————— Grant'lar —————
grant execute on function public.oneri_trending(int) to anon, authenticated;
grant execute on function public.oneri_kisisel(uuid, int) to authenticated;
grant execute on function public.oneri_getir(uuid, int) to anon, authenticated;
grant execute on function public.set_oneri_strateji(text) to authenticated;
