-- 03_analytics.sql — Analiz fonksiyonları (security definer + admin kontrolü)
-- 02_admin_policies.sql'den SONRA çalıştır. İstemci supabase.rpc(...) ile çağırır;
-- her fonksiyon önce is_admin() doğrular, bu yüzden veriyi yalnızca admin çekebilir.

-- Özet: toplam izlenme, kayıtlı tekil izleyici, toplam saniye, son 7 gün
create or replace function public.analytics_summary()
returns table (
  toplam_izlenme bigint,
  tekil_izleyici bigint,
  toplam_saniye numeric,
  son7_gun bigint
)
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
    select
      count(*)::bigint,
      count(distinct w.user_id)::bigint,
      coalesce(sum(w.seconds), 0),
      (count(*) filter (where w.created_at > now() - interval '7 days'))::bigint
    from public.watch_events w;
end;
$$;

-- Günlük trend: son N günün izlenme sayıları (boş günler 0 döner)
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
      current_date - (gun_sayisi - 1), current_date, interval '1 day'
    ) as d
    left join public.watch_events w on w.created_at::date = d::date
    group by 1
    order by 1;
end;
$$;

-- En çok izlenen başlıklar
create or replace function public.analytics_top_titles(adet int default 10)
returns table (baslik_ad text, izlenme bigint)
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
    select t.name, count(*)::bigint
    from public.watch_events w
    join public.videos v on v.id = w.video_id
    join public.titles t on t.id = v.title_id
    group by t.name
    order by 2 desc
    limit adet;
end;
$$;

-- Tekrar izleme oranı: kayıtlı kullanıcı-bölüm çiftlerinde 2+ izlemenin yüzdesi
create or replace function public.analytics_rewatch()
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  oran numeric;
begin
  if not public.is_admin() then
    raise exception 'yalnizca admin erisebilir';
  end if;
  select case
    when count(*) = 0 then 0
    else round(100.0 * count(*) filter (where c > 1) / count(*), 1)
  end
  into oran
  from (
    select w.user_id, w.video_id, count(*) as c
    from public.watch_events w
    where w.user_id is not null
    group by 1, 2
  ) x;
  return oran;
end;
$$;

-- Fonksiyonları yalnızca giriş yapmış kullanıcılar çağırabilsin
revoke execute on function public.analytics_summary() from public, anon;
revoke execute on function public.analytics_daily(int) from public, anon;
revoke execute on function public.analytics_top_titles(int) from public, anon;
revoke execute on function public.analytics_rewatch() from public, anon;
grant execute on function public.analytics_summary() to authenticated;
grant execute on function public.analytics_daily(int) to authenticated;
grant execute on function public.analytics_top_titles(int) to authenticated;
grant execute on function public.analytics_rewatch() to authenticated;
