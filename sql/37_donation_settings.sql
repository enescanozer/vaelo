-- 37_donation_settings.sql — "Sanatçı Desteği / Bağış" YALNIZCA parametrik altyapı.
-- BU FAZDA GERÇEK ÖDEME YOK: payment provider entegrasyonu / para transferi / donations
-- /balances/payment_accounts tabloları YOK (gereksiz tablo üretme kararı). Yalnız mevcut
-- app_settings (key/value) üzerinde feature flag + parametreler. VARSAYILAN: KAPALI.
--
-- İleride ödeme sağlayıcı bağlanınca: bu bayrak true yapılır + o zaman donations tabloları eklenir.

insert into public.app_settings (key, value) values
  ('creator_donations_enabled', 'false'),
  ('creator_donations_min_amount', '5'),
  ('creator_donations_max_amount', '1000'),
  ('creator_donations_currency', 'USD'),
  ('creator_donations_provider', '')      -- boş → "Payment provider not configured"
on conflict (key) do nothing;

-- app_settings okuma ilkesi "girisli okur" olduğundan, bağış bayrağını HERKESE (anon dahil)
-- açan whitelisted getter — yalnız bu 5 anahtarı döndürür, diğer ayarları ifşa etmez.
-- Admin güncellemesi mevcut app_settings admin RLS'i ile (AdminPanel key/value yazar).
create or replace function public.bagis_ayarlari()
returns table (enabled boolean, min_amount numeric, max_amount numeric, currency text, provider text)
language sql stable security definer set search_path = public as $$
  select
    coalesce((select value = 'true' from public.app_settings where key = 'creator_donations_enabled'), false),
    coalesce((select value::numeric from public.app_settings where key = 'creator_donations_min_amount'), 5),
    coalesce((select value::numeric from public.app_settings where key = 'creator_donations_max_amount'), 1000),
    coalesce((select value from public.app_settings where key = 'creator_donations_currency'), 'USD'),
    coalesce((select value from public.app_settings where key = 'creator_donations_provider'), '');
$$;
grant execute on function public.bagis_ayarlari() to anon, authenticated;
