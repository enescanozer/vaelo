-- Bu dosya sql/07_revenue.sql dosyasından üretildi — ELLE DÜZENLEME, sql/ altını değiştirip
-- `npm run db:sync` çalıştır.

-- 07_revenue.sql — Gelir katmanı: sponsorlar (pre-roll), reklam olayları, platform
-- ayarları ve üretici hakediş raporu. 06'dan sonra çalıştır.

-- ————— Sponsorlar —————
create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  message text,
  url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.sponsors enable row level security;

-- Aktif sponsor herkese görünür (oynatıcı pre-roll'u çeker); yönetim yalnızca admin
create policy "sponsor: aktif herkese acik" on public.sponsors
  for select using (active = true);
create policy "sponsor: admin okur" on public.sponsors
  for select using (public.is_admin());
create policy "sponsor: admin ekler" on public.sponsors
  for insert with check (public.is_admin());
create policy "sponsor: admin gunceller" on public.sponsors
  for update using (public.is_admin()) with check (public.is_admin());
create policy "sponsor: admin siler" on public.sponsors
  for delete using (public.is_admin());

-- ————— Reklam olayları (gösterim / tıklama) —————
create table public.ad_events (
  id bigint generated always as identity primary key,
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  video_id uuid references public.videos(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  kind text not null default 'impression' check (kind in ('impression', 'click')),
  created_at timestamptz not null default now()
);

create index ad_events_sponsor_idx on public.ad_events (sponsor_id, created_at);

alter table public.ad_events enable row level security;

create policy "reklam: herkes olay yazar" on public.ad_events
  for insert with check (user_id is null or user_id = auth.uid());
create policy "reklam: admin okur" on public.ad_events
  for select using (public.is_admin());

-- ————— Platform ayarları —————
-- rpm_usd: 1000 izlenme başına üretici hakedişi (USD). Admin panelden/SQL'den güncellenir.
create table public.app_settings (
  key text primary key,
  value text not null
);

alter table public.app_settings enable row level security;

create policy "ayar: girisli okur" on public.app_settings
  for select to authenticated using (true);
create policy "ayar: admin ekler" on public.app_settings
  for insert with check (public.is_admin());
create policy "ayar: admin gunceller" on public.app_settings
  for update using (public.is_admin()) with check (public.is_admin());

insert into public.app_settings (key, value) values ('rpm_usd', '2');

-- ————— Üretici hakediş raporu —————
-- Son 12 ayın izlenme toplamları ve rpm_usd üzerinden tahmini hakediş.
create or replace function public.creator_earnings()
returns table (ay date, izlenme bigint, saniye numeric, hakedis numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rpm numeric;
begin
  if auth.uid() is null then
    raise exception 'giris gerekli';
  end if;
  select coalesce(
    (select a.value::numeric from public.app_settings a where a.key = 'rpm_usd'), 2
  ) into rpm;
  return query
    select
      date_trunc('month', w.created_at)::date,
      count(*)::bigint,
      coalesce(sum(w.seconds), 0),
      round(count(*) * rpm / 1000.0, 2)
    from public.watch_events w
    join public.videos v on v.id = w.video_id
    where v.creator_id = auth.uid()
    group by 1
    order by 1 desc
    limit 12;
end;
$$;

revoke execute on function public.creator_earnings() from public, anon;
grant execute on function public.creator_earnings() to authenticated;
