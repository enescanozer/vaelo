-- Bu dosya sql/35_forum.sql dosyasından üretildi — ELLE DÜZENLEME, sql/ altını değiştirip
-- `npm run db:sync` çalıştır.

-- 35_forum.sql — İçerik bazlı topluluk forumu (film/dizi + bölüm seviyeli).
-- Yeniden kullanım: titles (title_id), videos (episode_id → "bölüm"), profiles (yazar/yetki),
-- is_admin()/is_moderator(). Video/Cloudflare şemasına DOKUNULMAZ (episode = mevcut videos satırı).
--
-- GÜVENLİK MODELİ: içerik YAZMA (thread/post oluştur/düzenle) moderasyon için forum-post Edge
-- Function'ından (service role) geçer → thread/post'ta CLIENT INSERT/UPDATE İLKESİ YOK.
-- Beğeni/takip/rapor kullanıcı-güdümlü (RLS ile kendi). Silme/moderasyon SECURITY DEFINER RPC.

-- ————— Konu (thread) —————
create table public.forum_threads (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.titles(id) on delete cascade,
  episode_id uuid references public.videos(id) on delete cascade, -- null → film/dizi geneli
  user_id uuid not null references public.profiles(id) on delete cascade,
  baslik text not null,
  status text not null default 'visible' check (status in ('visible', 'removed')),
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index forum_threads_title_idx on public.forum_threads (title_id, created_at desc);
create index forum_threads_episode_idx on public.forum_threads (episode_id, created_at desc)
  where episode_id is not null;

-- ————— Mesaj (post): nested cevap (parent_id) + spoiler + soft-delete —————
create table public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.forum_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.forum_posts(id) on delete cascade,
  content text not null,
  is_spoiler boolean not null default false,
  status text not null default 'visible' check (status in ('visible', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index forum_posts_thread_idx on public.forum_posts (thread_id, created_at);
create index forum_posts_user_idx on public.forum_posts (user_id);

-- ————— Beğeni (kullanıcı başına tek) —————
create table public.forum_post_likes (
  post_id uuid not null references public.forum_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- ————— Konu takibi —————
create table public.forum_thread_follows (
  thread_id uuid not null references public.forum_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

-- ————— Rapor (kişi başına aynı mesaja tek → abuse engeli) —————
create table public.forum_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.forum_posts(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  description text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (post_id, reporter_id)
);
create index forum_reports_open_idx on public.forum_reports (status, created_at) where status = 'open';

-- ————— RLS —————
alter table public.forum_threads enable row level security;
alter table public.forum_posts enable row level security;
alter table public.forum_post_likes enable row level security;
alter table public.forum_thread_follows enable row level security;
alter table public.forum_reports enable row level security;

-- Threads: görünür herkese; sahibi kendini; yetkili hepsini. YAZMA yok (edge fn / RPC).
create policy "forum_thread: gorunur herkese acik" on public.forum_threads
  for select using (status = 'visible');
create policy "forum_thread: sahibi gorur" on public.forum_threads
  for select using (user_id = auth.uid());
create policy "forum_thread: yetkili gorur" on public.forum_threads
  for select using (public.is_moderator());

-- Posts: görünür + silinmemiş herkese; sahibi kendini; yetkili hepsini. YAZMA yok (edge fn / RPC).
create policy "forum_post: gorunur herkese acik" on public.forum_posts
  for select using (status = 'visible' and deleted_at is null);
create policy "forum_post: sahibi gorur" on public.forum_posts
  for select using (user_id = auth.uid());
create policy "forum_post: yetkili gorur" on public.forum_posts
  for select using (public.is_moderator());

-- Beğeni: sayım için herkese okuma; kullanıcı kendi beğenisini ekler/siler (duplicate → PK 23505).
create policy "forum_like: herkes okur" on public.forum_post_likes
  for select using (true);
create policy "forum_like: kendi ekler" on public.forum_post_likes
  for insert with check (user_id = auth.uid());
create policy "forum_like: kendi siler" on public.forum_post_likes
  for delete using (user_id = auth.uid());

-- Takip: yalnız kendi.
create policy "forum_follow: kendi okur" on public.forum_thread_follows
  for select using (user_id = auth.uid());
create policy "forum_follow: kendi ekler" on public.forum_thread_follows
  for insert with check (user_id = auth.uid());
create policy "forum_follow: kendi siler" on public.forum_thread_follows
  for delete using (user_id = auth.uid());

-- Rapor: raporlayan kendi ekler (unique aynı mesaja tekrarı engeller); yetkili hepsini görür.
create policy "forum_report: kendi ekler" on public.forum_reports
  for insert with check (reporter_id = auth.uid());
create policy "forum_report: kendi gorur" on public.forum_reports
  for select using (reporter_id = auth.uid());
create policy "forum_report: yetkili gorur" on public.forum_reports
  for select using (public.is_moderator());

-- ————— Okuma RPC'leri (yazar display_name'i profiles self-only RLS'i nedeniyle DEFINER ile) —————
-- Yalnız herkese açık nickname döner; forum_threads/posts RLS zaten görünürlüğü sınırlar.
create or replace function public.forum_konular(p_title uuid, p_episode uuid default null)
returns table (
  id uuid, baslik text, user_id uuid, yazar text, locked boolean,
  mesaj_sayisi bigint, son_mesaj timestamptz, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select t.id, t.baslik, t.user_id, pr.display_name, t.locked,
         count(p.id) filter (where p.status = 'visible' and p.deleted_at is null),
         max(p.created_at), t.created_at
  from public.forum_threads t
  left join public.profiles pr on pr.id = t.user_id
  left join public.forum_posts p on p.thread_id = t.id
  where t.status = 'visible' and t.title_id = p_title
    and (p_episode is null or t.episode_id = p_episode)
  group by t.id, pr.display_name
  order by max(p.created_at) desc nulls last, t.created_at desc;
$$;
grant execute on function public.forum_konular(uuid, uuid) to anon, authenticated;

create or replace function public.forum_mesajlar(p_thread uuid)
returns table (
  id uuid, parent_id uuid, user_id uuid, yazar text, content text, is_spoiler boolean,
  begeni bigint, benim_begenim boolean, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.parent_id, p.user_id, pr.display_name, p.content, p.is_spoiler,
         count(l.user_id), bool_or(l.user_id = auth.uid()),
         p.created_at, p.updated_at
  from public.forum_posts p
  left join public.profiles pr on pr.id = p.user_id
  left join public.forum_post_likes l on l.post_id = p.id
  where p.thread_id = p_thread and p.status = 'visible' and p.deleted_at is null
  group by p.id, pr.display_name
  order by p.created_at;
$$;
grant execute on function public.forum_mesajlar(uuid) to anon, authenticated;

-- ————— Kullanıcı eylemleri (SECURITY DEFINER; RLS'i denetimli aşar) —————
-- Kendi mesajını sil (soft): yalnız sahibi. İçerik değişmez, deleted_at + status set edilir.
create or replace function public.forum_post_sil(p_post uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.forum_posts
    set deleted_at = now(), status = 'removed', updated_at = now()
    where id = p_post and user_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'yetki yok veya mesaj yok'; end if;
end;
$$;
revoke execute on function public.forum_post_sil(uuid) from public, anon;
grant execute on function public.forum_post_sil(uuid) to authenticated;

-- ————— Moderasyon eylemleri (yetkili: is_moderator) —————
create or replace function public.forum_post_kaldir(p_post uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'yalniz yetkili'; end if;
  update public.forum_posts set status = 'removed', updated_at = now() where id = p_post;
  -- Mesaj kaldırılınca ilgili açık raporlar da çözülür
  update public.forum_reports set status = 'resolved', reviewed_by = auth.uid(), reviewed_at = now()
    where post_id = p_post and status = 'open';
end; $$;
revoke execute on function public.forum_post_kaldir(uuid) from public, anon;
grant execute on function public.forum_post_kaldir(uuid) to authenticated;

create or replace function public.forum_thread_kaldir(p_thread uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'yalniz yetkili'; end if;
  update public.forum_threads set status = 'removed', updated_at = now() where id = p_thread;
end; $$;
revoke execute on function public.forum_thread_kaldir(uuid) from public, anon;
grant execute on function public.forum_thread_kaldir(uuid) to authenticated;

create or replace function public.forum_thread_kilitle(p_thread uuid, p_locked boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'yalniz yetkili'; end if;
  update public.forum_threads set locked = p_locked, updated_at = now() where id = p_thread;
end; $$;
revoke execute on function public.forum_thread_kilitle(uuid, boolean) from public, anon;
grant execute on function public.forum_thread_kilitle(uuid, boolean) to authenticated;

-- Rapor kararı: yetkili raporu kapatır (resolved/dismissed) + inceleyen/zaman.
create or replace function public.forum_report_karar(p_report uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'yalniz yetkili'; end if;
  if p_status not in ('resolved', 'dismissed') then raise exception 'gecersiz durum'; end if;
  update public.forum_reports
    set status = p_status, reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_report;
end; $$;
revoke execute on function public.forum_report_karar(uuid, text) from public, anon;
grant execute on function public.forum_report_karar(uuid, text) to authenticated;

-- Thread yönetim listesi (yetkili): son konular + yazar + durum (admin panel thread yönetimi).
create or replace function public.forum_thread_yonetim(p_ara text default null)
returns table (
  id uuid, baslik text, yazar text, title_ad text, status text, locked boolean,
  mesaj_sayisi bigint, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select th.id, th.baslik, pr.display_name, ti.name, th.status, th.locked,
         count(p.id) filter (where p.status = 'visible' and p.deleted_at is null), th.created_at
  from public.forum_threads th
  left join public.profiles pr on pr.id = th.user_id
  left join public.titles ti on ti.id = th.title_id
  left join public.forum_posts p on p.thread_id = th.id
  where public.is_moderator()
    and (p_ara is null or th.baslik ilike '%' || p_ara || '%')
  group by th.id, pr.display_name, ti.name
  order by th.created_at desc
  limit 100;
$$;
revoke execute on function public.forum_thread_yonetim(text) from public, anon;
grant execute on function public.forum_thread_yonetim(text) to authenticated;

-- Açık rapor kuyruğu (yetkili): mesaj + rapor sayısı/gerekçeleri (admin panel).
create or replace function public.forum_rapor_kuyrugu()
returns table (
  post_id uuid, thread_id uuid, thread_baslik text, icerik text,
  yazar text, poster_id uuid, post_status text, rapor_sayisi bigint, gerekceler text[]
)
language sql security definer set search_path = public as $$
  select p.id, p.thread_id, t.baslik, p.content, pr.display_name, p.user_id, p.status,
         count(r.id), array_agg(distinct r.reason)
  from public.forum_reports r
  join public.forum_posts p on p.id = r.post_id
  join public.forum_threads t on t.id = p.thread_id
  left join public.profiles pr on pr.id = p.user_id
  where public.is_moderator() and r.status = 'open'
  group by p.id, p.thread_id, t.baslik, p.content, pr.display_name, p.user_id, p.status
  order by count(r.id) desc, max(r.created_at) desc;
$$;
revoke execute on function public.forum_rapor_kuyrugu() from public, anon;
grant execute on function public.forum_rapor_kuyrugu() to authenticated;

-- Bir mesaja ait açık raporları toplu kapat (yetkili) — "yoksay" (dismissed) aksiyonu.
create or replace function public.forum_post_rapor_kapat(p_post uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'yalniz yetkili'; end if;
  if p_status not in ('resolved', 'dismissed') then raise exception 'gecersiz durum'; end if;
  update public.forum_reports set status = p_status, reviewed_by = auth.uid(), reviewed_at = now()
    where post_id = p_post and status = 'open';
end; $$;
revoke execute on function public.forum_post_rapor_kapat(uuid, text) from public, anon;
grant execute on function public.forum_post_rapor_kapat(uuid, text) to authenticated;
