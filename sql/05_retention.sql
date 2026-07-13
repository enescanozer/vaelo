-- 05_retention.sql — Tutundurma katmanı: Listem, izleme ilerlemesi, sanatçı istatistikleri
-- 03_analytics.sql'den SONRA çalıştır (Supabase Dashboard → SQL Editor).

-- ————— Listem —————
create table public.my_list (
  user_id uuid not null references public.profiles(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, title_id)
);

alter table public.my_list enable row level security;

create policy "listem: kendi listesini okur" on public.my_list
  for select using (user_id = auth.uid());
create policy "listem: kendi listesine ekler" on public.my_list
  for insert with check (user_id = auth.uid());
create policy "listem: kendi listesinden cikarir" on public.my_list
  for delete using (user_id = auth.uid());

-- ————— İzleme ilerlemesi —————
-- Oynatıcı, girişli kullanıcının kendi izlenme olayındaki seconds değerini günceller.
-- (Anonim olaylar user_id boş olduğundan güncellenemez; onlar görüntülenme sayısıdır.)
create policy "izlenme: kendi olayini gunceller" on public.watch_events
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- "İzlemeye devam et" sorgusu için
create index watch_events_user_idx on public.watch_events (user_id, created_at desc);

-- ————— Sanatçı istatistikleri —————
-- Üretici, watch_events'i doğrudan okuyamaz (RLS); bu fonksiyon security definer ile
-- YALNIZCA kendi videolarının toplamlarını döndürür.
create or replace function public.creator_stats()
returns table (
  bolum_id uuid,
  baslik_ad text,
  bolum_ad text,
  sezon int,
  bolum int,
  durum text,
  izlenme bigint,
  toplam_saniye numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'giris gerekli';
  end if;
  return query
    select
      v.id,
      tt.name,
      v.name,
      v.season,
      v.episode,
      v.status,
      count(w.id)::bigint,
      coalesce(sum(w.seconds), 0)
    from public.videos v
    join public.titles tt on tt.id = v.title_id
    left join public.watch_events w on w.video_id = v.id
    where v.creator_id = auth.uid()
    group by v.id, tt.name, tt.created_at, v.name, v.season, v.episode, v.status
    order by tt.created_at desc, v.season nulls first, v.episode nulls first;
end;
$$;

revoke execute on function public.creator_stats() from public, anon;
grant execute on function public.creator_stats() to authenticated;
