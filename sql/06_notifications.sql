-- 06_notifications.sql — Bildirimler: Listem'deki başlığa yeni bölüm onaylanınca kuyruk
-- 05_retention.sql'den SONRA çalıştır. E-posta gönderimi: supabase/functions/notify-new-content
-- (zamanlanmış çalışır); uygulama içi zil aynı tabloyu okur.

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title_id uuid references public.titles(id) on delete cascade,
  video_id uuid references public.videos(id) on delete cascade,
  kind text not null default 'yeni_bolum' check (kind in ('yeni_bolum', 'yeni_icerik')),
  read_at timestamptz,      -- uygulama içinde görüldü
  emailed_at timestamptz,   -- e-posta gönderildi
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_bekleyen_idx on public.notifications (emailed_at) where emailed_at is null;

alter table public.notifications enable row level security;

-- Kullanıcı yalnızca kendi bildirimlerini görür ve (okundu işaretlemek için) günceller.
-- Insert ilkesi YOK: kayıtlar yalnızca tetikleyici/service role ile açılır.
create policy "bildirim: kendininkini okur" on public.notifications
  for select using (user_id = auth.uid());
create policy "bildirim: kendininkini gunceller" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Video onaylanınca, başlığı Listem'inde tutan herkese bildirim düşür (üretici hariç)
create or replace function public.bildirim_uret()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    insert into public.notifications (user_id, title_id, video_id, kind)
    select ml.user_id, new.title_id, new.id, 'yeni_bolum'
    from public.my_list ml
    where ml.title_id = new.title_id
      and ml.user_id is distinct from new.creator_id;
  end if;
  return new;
end;
$$;

create trigger videos_bildirim
  after update on public.videos
  for each row execute function public.bildirim_uret();
