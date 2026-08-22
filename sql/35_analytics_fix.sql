-- 35 — Analiz düzeltmesi: test içeriğini hariç tut + metrik tanımlarını netleştir.
-- Sorun: (a) test/QA içeriği ("deneme") gerçek metrikleri çarpıtıyordu (is_test yoktu);
-- (b) fonksiyonlar test içeriğini süzmüyordu. Çözüm: titles.is_test flag'i + tüm analiz
-- sorgularında watch_events -> videos -> titles join'i ile `not is_test` filtresi.
-- Metrik tanımları (hepsi TEST İÇERİĞİ HARİÇ):
--   toplam_izlenme  = tüm izleme olayları (kayıtlı + anonim)
--   tekil_izleyici  = farklı KAYITLI kullanıcı sayısı (anonim sayılmaz — ad "kayıtlı tekil")
--   son7_gun        = son 7 gündeki izleme olayı sayısı
--   tekrar_izleme % = 2+ kez izlenen (kayıtlı kullanıcı, video) çiftlerinin oranı

alter table public.titles add column if not exists is_test boolean not null default false;

-- Mevcut açık test içeriğini işaretle (adı tam "deneme" olanlar). Admin panelden değiştirilebilir.
update public.titles set is_test = true where lower(trim(name)) = 'deneme' and is_test = false;

-- ————— Özet (test hariç) —————
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
    from public.watch_events w
    join public.videos v on v.id = w.video_id
    join public.titles t on t.id = v.title_id
    where not coalesce(t.is_test, false);
end;
$$;

-- ————— Günlük trend (test hariç, UTC gün) —————
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
    left join (
      select w.id, w.created_at
      from public.watch_events w
      join public.videos v on v.id = w.video_id
      join public.titles t on t.id = v.title_id
      where not coalesce(t.is_test, false)
    ) w on (w.created_at at time zone 'UTC')::date = d::date
    group by 1
    order by 1;
end;
$$;

-- ————— En çok izlenenler (test hariç) —————
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
    where not coalesce(t.is_test, false)
    group by t.name
    order by 2 desc
    limit adet;
end;
$$;

-- ————— Tekrar izleme oranı (test hariç): 2+ izlenen (kayıtlı kullanıcı, video) çiftlerinin % 'si —————
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
    join public.videos v on v.id = w.video_id
    join public.titles t on t.id = v.title_id
    where w.user_id is not null and not coalesce(t.is_test, false)
    group by 1, 2
  ) x;
  return oran;
end;
$$;
