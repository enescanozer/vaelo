-- 37 — Öneri sistemi gelişmiş: collaborative strateji + A/B testi + performans ölçümü.
-- sql/36 üzerine kurar. Backend'de kalır (ince istemci).

-- ————— A/B + segment kolonları —————
alter table public.recommendation_config
  add column if not exists ab_aktif boolean not null default false,
  add column if not exists ab_a text,
  add column if not exists ab_b text;
alter table public.recommendation_log
  add column if not exists segment text;

-- ————— Strateji: COLLABORATIVE (benzer kullanıcı) —————
-- Ortak başlık izleyen kullanıcıları bul (ortak sayısı = benzerlik ağırlığı), onların
-- izleyip bu kullanıcının izlemediği yayınlanmış başlıkları ağırlıklı öner. Düşük
-- kullanıcı sayısında gürültülü olabilir → boş/zayıfsa dağıtıcı trending'e düşer.
create or replace function public.oneri_collaborative(p_user uuid, p_top int default 12)
returns table (title_id uuid, score numeric)
language sql
stable
security definer
set search_path = public
as $$
  with benim as (
    select distinct v.title_id
    from public.watch_events w
    join public.videos v on v.id = w.video_id
    where w.user_id = p_user
  ),
  benzer as (
    select w.user_id, count(distinct v.title_id)::numeric ortak
    from public.watch_events w
    join public.videos v on v.id = w.video_id
    where v.title_id in (select title_id from benim)
      and w.user_id is not null and w.user_id <> p_user
    group by w.user_id
  )
  select v.title_id, sum(b.ortak) as score
  from benzer b
  join public.watch_events w on w.user_id = b.user_id
  join public.videos v on v.id = w.video_id
  join public.titles t on t.id = v.title_id
  where t.status = 'published' and not coalesce(t.is_test, false)
    and v.title_id not in (select title_id from benim)
  group by v.title_id
  order by score desc
  limit p_top;
$$;

-- ————— Dağıtıcı (A/B + collaborative dahil) —————
create or replace function public.oneri_getir(p_user uuid default null, p_top int default 12)
returns table (title_id uuid, score numeric)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cfg record;
  strat text;
  seg text;
begin
  select * into cfg from public.recommendation_config where id = 1;
  strat := coalesce(cfg.active_strategy, 'trending');

  -- A/B: kullanıcıyı user_id hash'iyle 50/50 A veya B segmentine ata
  if cfg.ab_aktif and p_user is not null and cfg.ab_a is not null and cfg.ab_b is not null then
    if (('x' || substr(md5(p_user::text), 1, 8))::bit(32)::int & 1) = 0 then
      strat := cfg.ab_a; seg := 'A';
    else
      strat := cfg.ab_b; seg := 'B';
    end if;
  end if;

  begin
    insert into public.recommendation_log (user_id, strategy, segment) values (p_user, strat, seg);
  exception when others then null;
  end;

  if strat = 'kisisel' and p_user is not null then
    return query select * from public.oneri_kisisel(p_user, p_top);
    if found then return; end if;
  elsif strat = 'collaborative' and p_user is not null then
    return query select * from public.oneri_collaborative(p_user, p_top);
    if found then return; end if;
  end if;

  return query select * from public.oneri_trending(p_top);
end;
$$;

-- ————— Admin: A/B testini ayarla —————
create or replace function public.set_oneri_ab(p_aktif boolean, p_a text, p_b text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'yalnizca admin'; end if;
  if p_a is not null and p_a not in ('kisisel','trending','collaborative') then raise exception 'gecersiz a'; end if;
  if p_b is not null and p_b not in ('kisisel','trending','collaborative') then raise exception 'gecersiz b'; end if;
  update public.recommendation_config
    set ab_aktif = p_aktif, ab_a = p_a, ab_b = p_b, updated_at = now(), updated_by = auth.uid()
    where id = 1;
end;
$$;

-- ————— Performans: strateji bazlı sunum + etkileşim (attribution proxy) —————
-- Her sunumdan sonra 24s içinde aynı kullanıcının bir izlemesi varsa "etkileşim" sayılır.
-- oran = etkileşimli sunum / toplam sunum (rough CTR/engagement proxy — tıklama takibi yok).
create or replace function public.oneri_performans(p_gun int default 7)
returns table (strategy text, sunum bigint, tekil_kullanici bigint, sonraki_izlenme bigint, oran numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'yalnizca admin'; end if;
  return query
  with loglar as (
    select l.id, l.user_id, l.strategy, l.created_at
    from public.recommendation_log l
    where l.created_at > now() - (p_gun || ' days')::interval
  ),
  etkilesim as (
    select distinct lg.id
    from loglar lg
    join public.watch_events w on w.user_id = lg.user_id
      and w.created_at > lg.created_at
      and w.created_at < lg.created_at + interval '24 hours'
    where lg.user_id is not null
  )
  select lg.strategy,
    count(*)::bigint,
    count(distinct lg.user_id)::bigint,
    count(*) filter (where e.id is not null)::bigint,
    case when count(*) = 0 then 0
         else round(100.0 * count(*) filter (where e.id is not null) / count(*), 1) end
  from loglar lg
  left join etkilesim e on e.id = lg.id
  group by lg.strategy
  order by 2 desc;
end;
$$;

grant execute on function public.oneri_collaborative(uuid, int) to authenticated;
grant execute on function public.set_oneri_ab(boolean, text, text) to authenticated;
grant execute on function public.oneri_performans(int) to authenticated;
