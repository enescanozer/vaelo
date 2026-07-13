-- 01_schema.sql — Şema + RLS + profil tetikleyicisi
-- Çalıştırma: Supabase Dashboard → SQL Editor'e yapıştır ya da `supabase db push` öncesi
-- migration olarak ekle. Dosyalar numara sırasıyla çalıştırılır: 01 → 02 → 03 → (04 örnek veri).

-- ————— Profiller —————
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'viewer' check (role in ('viewer', 'creator', 'admin')),
  created_at timestamptz not null default now()
);

-- ————— Başlıklar (film / dizi) —————
create table public.titles (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.profiles(id) on delete set null,
  name text not null,
  description text,
  kind text not null default 'film' check (kind in ('film', 'dizi')),
  genre text,
  year int,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  published_at timestamptz
);

-- ————— Videolar (bölümler) —————
-- Kayıt yalnızca create-upload Edge Function (service role) tarafından açılır;
-- durum geçişleri: uploading → in_review (webhook) → approved/rejected (admin).
create table public.videos (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.titles(id) on delete cascade,
  creator_id uuid references public.profiles(id) on delete set null,
  name text,
  season int,
  episode int,
  cf_uid text unique,
  duration_seconds numeric not null default 0,
  status text not null default 'uploading'
    check (status in ('uploading', 'processing', 'in_review', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  published_at timestamptz
);

-- ————— İzlenme olayları —————
-- İzleme ücretsiz ve girişsiz olabildiği için user_id boş kalabilir.
create table public.watch_events (
  id bigint generated always as identity primary key,
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  seconds numeric not null default 0,
  created_at timestamptz not null default now()
);

create index watch_events_video_idx on public.watch_events (video_id);
create index watch_events_created_idx on public.watch_events (created_at);
create index videos_title_idx on public.videos (title_id);

-- ————— RLS: her tabloda açık —————
alter table public.profiles enable row level security;
alter table public.titles enable row level security;
alter table public.videos enable row level security;
alter table public.watch_events enable row level security;

-- Profiller: herkes yalnızca kendi profilini görür/günceller
create policy "profil: kendi kaydini okur" on public.profiles
  for select using (id = auth.uid());
create policy "profil: kendi kaydini gunceller" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Rolü kullanıcı kendisi değiştiremez (admin ataması SQL/servis rolüyle yapılır)
create or replace function public.rol_degisimini_engelle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.role() <> 'service_role' then
    raise exception 'rol yalnizca servis tarafindan degistirilebilir';
  end if;
  return new;
end;
$$;

create trigger profiles_rol_koruma
  before update on public.profiles
  for each row execute function public.rol_degisimini_engelle();

-- Başlıklar: herkese açık okuma YALNIZCA yayınlanmışta; üretici kendi taslaklarını görür
create policy "baslik: yayinlanmis herkese acik" on public.titles
  for select using (status = 'published');
create policy "baslik: uretici kendininkini gorur" on public.titles
  for select using (creator_id = auth.uid());
create policy "baslik: uretici taslak acar" on public.titles
  for insert with check (creator_id = auth.uid() and status = 'draft');
create policy "baslik: uretici taslagini duzenler" on public.titles
  for update using (creator_id = auth.uid() and status = 'draft')
  with check (creator_id = auth.uid() and status = 'draft');

-- Videolar: herkese açık okuma YALNIZCA onaylıda; üretici kendininkini görür.
-- İstemciden insert/update YOK — kayıt Edge Function (service role), geçişler webhook/admin.
create policy "video: onayli herkese acik" on public.videos
  for select using (status = 'approved');
create policy "video: uretici kendininkini gorur" on public.videos
  for select using (creator_id = auth.uid());

-- İzlenme olayları: herkes (girişsiz dahil) olay yazabilir; kimlik ya boş ya kendisi.
-- Okuma yalnızca kendi olayları (ileride "izlemeye devam et" için); toplu okuma admin (02).
create policy "izlenme: herkes olay yazar" on public.watch_events
  for insert with check (user_id is null or user_id = auth.uid());
create policy "izlenme: kendi olaylarini okur" on public.watch_events
  for select using (user_id = auth.uid());

-- ————— Yeni kullanıcıda otomatik profil —————
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
