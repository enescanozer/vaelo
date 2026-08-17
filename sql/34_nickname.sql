-- Kullanıcı takma adı (nickname): mevcut profiles.display_name kanonik ad olarak kullanılır.
-- Sorun: display_name kayıtta e-postadan türetiliyordu (handle_new_user split_part) → kullanıcı
-- kendi seçmemiş olabilir. display_name_chosen: kullanıcı GERÇEKTEN bir takma ad seçti mi.
-- İlk-kurulum akışı bu bayrağa bakar; seçilmemişse takma ad sorulur.
alter table public.profiles
  add column if not exists display_name_chosen boolean not null default false;

comment on column public.profiles.display_name_chosen is
  'Kullanıcı takma adını kendi seçti mi (false → e-postadan türetilmiş varsayılan, ilk-kurulum sorulur)';

-- Büyük/küçük harf duyarsız TEKİLLİK — yalnız SEÇİLMİŞ adlarda (e-postadan türetilmiş
-- varsayılanlar çakışabilir; onlar kısıtlanmaz). Doğrudan client update'inde de 23505 verir.
create unique index if not exists profiles_nickname_uniq
  on public.profiles (lower(display_name))
  where display_name_chosen = true and display_name is not null;
