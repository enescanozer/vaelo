-- Bu dosya sql/19_art_screen.sql dosyasından üretildi — ELLE DÜZENLEME, sql/ altını değiştirip
-- `npm run db:sync` çalıştır.

-- 19_art_screen.sql — Tablo görselleri için AI ön-eleme alanları
-- 18_roles.sql'den SONRA çalıştır. Değerleri yalnız art-screen Edge Function (service role)
-- yazar; moderasyon görünümünde rozet (⚠) olarak çıkar. Nihai karar moderatör/adminde.

alter table public.art_pieces
  add column ai_risk text check (ai_risk in ('low', 'medium', 'high')),
  add column ai_ozet text,
  add column ai_incelendi_at timestamptz;

-- Zamanlanmış tarama sorgusu: değerlendirilmemiş, gösterilecek eserler
create index art_pieces_ai_bekleyen_idx on public.art_pieces (created_at)
  where durum in ('aktif', 'sergide') and ai_incelendi_at is null;

-- Moderatör de eserleri (ai_risk dahil) doğrudan okuyabilsin (moderasyon için).
-- (14_art.sql'de is_admin ile açılmıştı; anonim oy seti hâlâ sahip döndürmez.)
drop policy if exists "eser: admin görür" on public.art_pieces;
create policy "eser: moderator görür" on public.art_pieces
  for select using (public.is_moderator());
