-- Üreticiye özel paylaşım linki + basit attribution.
-- watchvaelo.com/?ref=<uretici_id> ile gelen yeni kullanıcının kaydında referans_kaynagi'na
-- yazılır (yalnız gerçek creator/admin). Admin panelinde "üretici → getirdiği kayıt" sayacı.

alter table public.profiles
  add column if not exists referans_kaynagi uuid references public.profiles(id) on delete set null;

comment on column public.profiles.referans_kaynagi is
  'Bu kullanıcıyı ?ref= linkiyle getiren üreticinin id''si (yalnız creator/admin; kayıtta set edilir)';

-- Yeni kullanıcıda profil açan tetikleyiciyi ref yakalayacak şekilde GÜNCELLE (01'i değiştirir).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref uuid;
begin
  -- metadata'daki 'ref' güvenli uuid cast; geçersizse null
  begin
    v_ref := (new.raw_user_meta_data ->> 'ref')::uuid;
  exception when others then
    v_ref := null;
  end;
  -- Yalnız GERÇEK bir creator/admin id'si geçerli (kendini/rastgele id'yi reddet)
  if v_ref is not null and not exists (
    select 1 from public.profiles where id = v_ref and role in ('creator', 'admin')
  ) then
    v_ref := null;
  end if;

  insert into public.profiles (id, display_name, referans_kaynagi)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    v_ref
  );
  return new;
end;
$$;

-- Admin sayaç: üretici → getirdiği kayıt sayısı (security definer + is_admin guard: non-admin boş döner).
create or replace function public.referans_sayaci()
returns table (uretici_id uuid, uretici_ad text, kayit_sayisi bigint)
language sql
security definer
set search_path = public
as $$
  select p.referans_kaynagi, r.display_name, count(*)
  from public.profiles p
  join public.profiles r on r.id = p.referans_kaynagi
  where public.is_admin() and p.referans_kaynagi is not null
  group by p.referans_kaynagi, r.display_name
  order by count(*) desc;
$$;
revoke execute on function public.referans_sayaci() from public, anon;
grant execute on function public.referans_sayaci() to authenticated;
