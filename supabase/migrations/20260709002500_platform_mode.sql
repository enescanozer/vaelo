-- Bu dosya sql/25_platform_mode.sql dosyasından üretildi — ELLE DÜZENLEME, sql/ altını değiştirip
-- `npm run db:sync` çalıştır.

-- 25_platform_mode.sql — Platform modu (festival ↔ netflix) + toplama-fazı promo banner'ları
-- 24'ten sonra. platform_mode HERKESE (anon dahil) okunur (landing modu her ziyaretçiye uygulanır).
-- Varsayılan 'festival' (mevcut gerçek durum — sessizce netflix'e düşme YOK).

-- ————— Platform modu (tek satır) —————
create table public.platform_config (
  id int primary key default 1 check (id = 1), -- tek satır garantisi
  mode text not null default 'festival' check (mode in ('festival', 'netflix')),
  updated_at timestamptz not null default now()
);
alter table public.platform_config enable row level security;

-- Okuma: herkes (anon dahil). Yazma: yalnız RPC (aşağıda; audit_log'a da yazar).
create policy "platform: herkes okur" on public.platform_config for select using (true);

insert into public.platform_config (id, mode) values (1, 'festival') on conflict (id) do nothing;

-- Mod değiştir + audit_log'a kaydet (mevcut denetim tablosunu yeniden kullanır). Admin gate.
-- platform_config int-singleton olduğundan audit trigger'ı yerine RPC: sabit "platform config"
-- referans uuid ile audit_log'a düşer (DenetimKaydi'nde görünür).
create or replace function public.platform_mode_ayarla(p_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eski text;
begin
  if not public.is_admin() then raise exception 'yalniz admin'; end if;
  if p_mode not in ('festival', 'netflix') then raise exception 'gecersiz mod'; end if;
  select mode into v_eski from public.platform_config where id = 1;
  update public.platform_config set mode = p_mode, updated_at = now() where id = 1;
  insert into public.audit_log (actor, tablo, kayit, eylem, detay)
  values (
    auth.uid(),
    'platform_config',
    '00000000-0000-4000-8000-0000706c6d63'::uuid, -- sabit "platform config" referansı
    'platform_mode_' || p_mode,
    jsonb_build_object('eski', v_eski, 'yeni', p_mode)
  );
end;
$$;
revoke execute on function public.platform_mode_ayarla(text) from public, anon;
grant execute on function public.platform_mode_ayarla(text) to authenticated;

-- ————— Toplama-fazı promo banner'ları (sponsors'tan AYRI: farklı amaç/yerleşim) —————
create table public.promo_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  image_url text,  -- opsiyonel görsel URL'i (yükleme değil — panelden URL yapıştırılır)
  link_url text,   -- katıl/gönder hedefi
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.promo_banners enable row level security;

-- Aktif banner herkese açık (landing); admin hepsini görür + tam CRUD (sponsors örüntüsü).
create policy "promo: aktif herkese acik" on public.promo_banners
  for select using (active = true);
create policy "promo: admin tam" on public.promo_banners
  for all using (public.is_admin()) with check (public.is_admin());
