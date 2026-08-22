-- 39 — Analiz günlük trendini TR (Europe/Istanbul) timezone'unda grupla.
-- DB'de zaman UTC saklanır; gün gruplaması sunucu/UTC yerine TR gününe göre yapılır
-- (admin panosu TR odaklı). Test içeriği (is_test) yine hariç.
create or replace function public.analytics_daily(gun_sayisi int default 14)
returns table (gun date, izlenme bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'yalnizca admin erisebilir';
  end if;
  return query
    select d::date, count(w.id)::bigint
    from generate_series(
      (now() at time zone 'Europe/Istanbul')::date - (gun_sayisi - 1),
      (now() at time zone 'Europe/Istanbul')::date,
      interval '1 day'
    ) as d
    left join (
      select w.id, w.created_at
      from public.watch_events w
      join public.videos v on v.id = w.video_id
      join public.titles t on t.id = v.title_id
      where not coalesce(t.is_test, false)
    ) w on (w.created_at at time zone 'Europe/Istanbul')::date = d::date
    group by 1
    order by 1;
end;
$$;
