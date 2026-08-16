-- Bu dosya sql/32_founder_content.sql dosyasından üretildi — ELLE DÜZENLEME, sql/ altını değiştirip
-- `npm run db:sync` çalıştır.

-- Kurucu içeriği etiketi (şeffaflık): kurucu/admin hesabından yüklenen içerik izleyiciye
-- AÇIKÇA "Kurucu Ekip" olarak gösterilir (topluluk üreticisi gibi sunulmaz → güven).
-- Yalnız admin işaretleyebilir; garanti RLS değil TRIGGER ile (normal üretici API'den spoof edemez).
alter table public.titles
  add column if not exists kurucu_icerigi boolean not null default false;

comment on column public.titles.kurucu_icerigi is
  'true → kurucu/admin ekip içeriği; detayda "Kurucu Ekip" rozeti. Yalnız admin set edebilir (trigger).';

-- true değerini yalnız admin verebilir; aksi halde her zaman false'a zorlanır (insert + update).
create or replace function public.kurucu_icerigi_koru()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kurucu_icerigi is true and not public.is_admin() then
    new.kurucu_icerigi := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_kurucu_icerigi_koru on public.titles;
create trigger trg_kurucu_icerigi_koru
  before insert or update on public.titles
  for each row execute function public.kurucu_icerigi_koru();
