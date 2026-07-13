-- Bu dosya sql/10_contest.sql dosyasından üretildi — ELLE DÜZENLEME, sql/ altını değiştirip
-- `npm run db:sync` çalıştır.

-- 10_contest.sql — Yarışma lansman modülü: yarışmalar, katılımlar, izleyici oylaması
-- 09'dan sonra çalıştır. Yarışma edinim/lansman taktiğidir; çekirdek ürün değildir.

-- ————— Yarışmalar —————
create table public.contests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.contests enable row level security;

create policy "yarisma: aktif herkese acik" on public.contests
  for select using (active = true);
create policy "yarisma: admin okur" on public.contests
  for select using (public.is_admin());
create policy "yarisma: admin ekler" on public.contests
  for insert with check (public.is_admin());
create policy "yarisma: admin gunceller" on public.contests
  for update using (public.is_admin()) with check (public.is_admin());

-- ————— Katılımlar —————
create table public.contest_entries (
  contest_id uuid not null references public.contests(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contest_id, title_id)
);

alter table public.contest_entries enable row level security;

-- Liste herkese açık (başlık RLS'i yayınlanmamışı zaten gizler)
create policy "katilim: herkes okur" on public.contest_entries
  for select using (true);
-- Üretici yalnızca KENDİ YAYINLANMIŞ başlığını AKTİF ve SÜRESİ GEÇMEMİŞ yarışmaya ekler
create policy "katilim: uretici kendi basligini ekler" on public.contest_entries
  for insert with check (
    exists (
      select 1 from public.titles ti
      where ti.id = title_id and ti.creator_id = auth.uid() and ti.status = 'published'
    )
    and exists (
      select 1 from public.contests c
      where c.id = contest_id and c.active
        and (c.ends_at is null or c.ends_at > now())
    )
  );
-- Geri çekme: kendi başlığı ya da admin
create policy "katilim: sahibi veya admin siler" on public.contest_entries
  for delete using (
    public.is_admin()
    or exists (
      select 1 from public.titles ti
      where ti.id = title_id and ti.creator_id = auth.uid()
    )
  );

-- ————— Oylar (yarışma başına kullanıcı başına TEK oy; oy değiştirilebilir) —————
create table public.contest_votes (
  contest_id uuid not null references public.contests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contest_id, user_id)
);

alter table public.contest_votes enable row level security;

-- Oy verilen içerik gerçekten yarışmada mı, yarışma aktif mi ve süresi geçmemiş mi?
create or replace function public.oy_gecerli(p_contest uuid, p_title uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contest_entries e
    join public.contests c on c.id = e.contest_id
    where e.contest_id = p_contest and e.title_id = p_title and c.active
      and (c.ends_at is null or c.ends_at > now())
  );
$$;

create policy "oy: kendi oyunu okur" on public.contest_votes
  for select using (user_id = auth.uid());
create policy "oy: kendi adina verir" on public.contest_votes
  for insert with check (user_id = auth.uid() and public.oy_gecerli(contest_id, title_id));
create policy "oy: kendi oyunu degistirir" on public.contest_votes
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.oy_gecerli(contest_id, title_id));

-- ————— Sonuçlar (herkese açık toplam; tekil oylar gizli kalır) —————
create or replace function public.contest_results(yarisma uuid)
returns table (title_id uuid, oy bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
    select v.title_id, count(*)::bigint
    from public.contest_votes v
    where v.contest_id = yarisma
    group by v.title_id
    order by 2 desc;
end;
$$;

grant execute on function public.contest_results(uuid) to anon, authenticated;
