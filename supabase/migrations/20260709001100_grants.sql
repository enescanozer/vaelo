-- Bu dosya sql/11_grants.sql dosyasından üretildi — ELLE DÜZENLEME, sql/ altını değiştirip
-- `npm run db:sync` çalıştır.

-- 11_grants.sql — Şema erişim hakları
-- RLS "hangi satırlar görünür" sorusunu yanıtlar; bu dosya rollerin tablolara
-- erişim iznini (grant) açar. Supabase bulutunda bu grant'lar varsayılan olarak
-- gelir; yerel/özel kurulumlarda aynı davranış için açıkça verilmelidir.
-- Güvenlik, satır düzeyinde RLS ilkelerindedir — grant tek başına veri açmaz.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- Bundan sonra oluşturulacak nesneler için de aynı varsayılanlar geçerli olsun
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
