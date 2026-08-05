-- 20_push.sql — Mobil push bildirimleri: cihaz token'ları + bildirim push durumu
-- 19_art_screen.sql'den SONRA çalıştır. Token'ı mobil istemci (expo-notifications) yazar;
-- send-push Edge Function (service role) kuyruktaki bildirimleri Expo Push API ile gönderir.

-- ————— Cihaz push token'ları —————
create table public.push_tokens (
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,               -- Expo push token (ExponentPushToken[...])
  platform text,                     -- ios | android
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

alter table public.push_tokens enable row level security;
-- Kullanıcı yalnız kendi token'larını yönetir/okur. Gönderim service role ile.
create policy "push: kendi okur" on public.push_tokens
  for select using (user_id = auth.uid());
create policy "push: kendi ekler" on public.push_tokens
  for insert to authenticated with check (user_id = auth.uid());
create policy "push: kendi gunceller" on public.push_tokens
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "push: kendi siler" on public.push_tokens
  for delete to authenticated using (user_id = auth.uid());

-- ————— Bildirim push durumu (e-posta gibi ayrı işaret) —————
alter table public.notifications add column push_sent_at timestamptz;
create index notifications_push_bekleyen_idx on public.notifications (push_sent_at)
  where push_sent_at is null;
