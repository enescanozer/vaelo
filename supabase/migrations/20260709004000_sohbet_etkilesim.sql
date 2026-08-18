-- Bu dosya sql/40_sohbet_etkilesim.sql dosyasından üretildi — ELLE DÜZENLEME, sql/ altını değiştirip
-- `npm run db:sync` çalıştır.

-- 40_sohbet_etkilesim.sql — Canlı sohbete Like + Reply + Mention. 38_bolum_sohbet.sql'den SONRA.
-- Mevcut yapı KORUNUR: sohbet_mesajlari / forum-post 'sohbet' action / moderasyon /text / realtime.
-- Güvenlik: like yalnız kendi (RLS), duplicate PK ile engellenir, sayım DB'den (client'a güvenilmez).

-- ————— Reply + mention alanları (DENORMALİZE → realtime payload self-contained; silinen parent'ta
--         preview korunur; reply ilişkisi soft-delete'te bozulmaz çünkü satır kalır) —————
alter table public.sohbet_mesajlari
  add column if not exists reply_to       uuid references public.sohbet_mesajlari(id) on delete set null,
  add column if not exists reply_nickname text,
  add column if not exists reply_ozet     text,                       -- parent mesajın yazma anındaki kısa önizlemesi
  add column if not exists mentions       uuid[] not null default '{}'; -- mention edilen GERÇEK user id'leri (forum-post doğrular)

-- ————— Beğeni: (mesaj, kullanıcı) TEKİL → aynı kullanıcı bir mesaja 1 like. oda: realtime filtre için. —————
create table if not exists public.sohbet_begeni (
  mesaj_id   uuid not null references public.sohbet_mesajlari(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  oda        text not null,
  created_at timestamptz not null default now(),
  primary key (mesaj_id, user_id)
);
create index if not exists sohbet_begeni_oda_idx   on public.sohbet_begeni (oda);
create index if not exists sohbet_begeni_mesaj_idx on public.sohbet_begeni (mesaj_id);

alter table public.sohbet_begeni enable row level security;
-- Okuma herkese açık (sayım + realtime); ekleme/silme YALNIZ kendi (login zorunlu → auth.uid()).
create policy "sohbet_begeni: herkes okur"  on public.sohbet_begeni for select using (true);
create policy "sohbet_begeni: kendi ekler"  on public.sohbet_begeni for insert with check (user_id = auth.uid());
create policy "sohbet_begeni: kendi siler"  on public.sohbet_begeni for delete using (user_id = auth.uid());

grant select on public.sohbet_begeni to anon, authenticated;
grant insert, delete on public.sohbet_begeni to authenticated;

-- Realtime (like/unlike anında güncellensin)
do $$
begin
  alter publication supabase_realtime add table public.sohbet_begeni;
exception when duplicate_object then null;
end $$;
alter table public.sohbet_begeni replica identity full;  -- DELETE payload'ında oda gelsin (filtre için)

-- ————— Okuma RPC: mesajlar + beğeni sayısı + benim beğenim + reply/mention (TEK sorgu) —————
create or replace function public.sohbet_getir(p_oda text, p_limit int default 100)
returns table (
  id uuid, oda text, user_id uuid, nickname text, mesaj text, is_spoiler boolean,
  reply_to uuid, reply_nickname text, reply_ozet text, mentions uuid[],
  created_at timestamptz, begeni_sayisi bigint, benim_begenim boolean
)
language sql stable security definer set search_path = public as $$
  select m.id, m.oda, m.user_id, m.nickname, m.mesaj, m.is_spoiler,
         m.reply_to, m.reply_nickname, m.reply_ozet, m.mentions,
         m.created_at,
         count(b.user_id) as begeni_sayisi,
         coalesce(bool_or(b.user_id = auth.uid()), false) as benim_begenim
  from public.sohbet_mesajlari m
  left join public.sohbet_begeni b on b.mesaj_id = m.id
  where m.oda = p_oda and m.status = 'visible' and m.deleted_at is null
  group by m.id
  order by m.created_at asc
  limit greatest(1, least(coalesce(p_limit, 100), 300));
$$;
grant execute on function public.sohbet_getir(text, int) to anon, authenticated;

-- ————— Mention autocomplete: nickname ile kullanıcı ara (yalnız authenticated) —————
-- Yalnız takma ad SEÇMİŞ kullanıcılar (display_name_chosen) → id + display_name. profiles self-only
-- RLS'ini denetimli aşar; yalnız herkese-açık nickname döner (sohbet/forumda zaten görünür).
create or replace function public.sohbet_kullanici_ara(p_q text, p_limit int default 6)
returns table (id uuid, display_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name
  from public.profiles p
  where p.display_name_chosen = true
    and p.display_name is not null
    and length(coalesce(p_q, '')) >= 1
    and p.display_name ilike '%' || p_q || '%'
  order by (lower(p.display_name) = lower(p_q)) desc,
           (lower(p.display_name) like lower(p_q) || '%') desc,
           p.display_name
  limit greatest(1, least(coalesce(p_limit, 6), 10));
$$;
revoke execute on function public.sohbet_kullanici_ara(text, int) from public, anon;
grant execute on function public.sohbet_kullanici_ara(text, int) to authenticated;
