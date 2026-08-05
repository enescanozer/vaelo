-- Bu dosya sql/14_art.sql dosyasından üretildi — ELLE DÜZENLEME, sql/ altını değiştirip
-- `npm run db:sync` çalıştır.

-- 14_art.sql — Haftalık AI görsel yarışması ("Tablo")
-- 13_captions.sql'den SONRA çalıştır.
--
-- Akış: hafta 'gonderim'de açılır (herkes haftada 1 eser yükler) → admin 'eleme'ye
-- alır ve tur tur en çok oyluları bırakır (oylama ANONİM: sahip gizli) → ≤50 kalınca
-- 'sergi'ye alınır (cumartesi; artık sahip + sosyal linkler görünür, puanlanabilir).
--
-- Anonimlik fonksiyon katmanıyla garanti: eleme setini döndüren fonksiyon creator_id'yi
-- İSTEMCİYE HİÇ GÖNDERMEZ; yalnız sergi fonksiyonu sahibi ekler.

-- ————— Görsel deposu (Supabase Storage) —————
-- Yalnız görsel türleri + 10 MB sınırı (kötüye kullanım/DoS'a karşı; RLS boyut/tür süzemez).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('art', 'art', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Yükleme: yalnız girişli kullanıcı, kendi id'siyle başlayan klasöre. Okuma herkese açık.
create policy "art: herkes okur" on storage.objects
  for select using (bucket_id = 'art');
create policy "art: kendi klasörüne yükler" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'art' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "art: kendi dosyasını siler" on storage.objects
  for delete to authenticated
  using (bucket_id = 'art' and (storage.foldername(name))[1] = auth.uid()::text);

-- ————— Haftalık döngü —————
create table public.art_weeks (
  id uuid primary key default gen_random_uuid(),
  hafta_no int,
  durum text not null default 'gonderim'
    check (durum in ('gonderim', 'eleme', 'sergi', 'bitti')),
  tur int not null default 0,        -- eleme tur numarası
  sergi_tarihi date,                 -- cumartesi
  created_at timestamptz not null default now()
);

alter table public.art_weeks enable row level security;
create policy "hafta: herkes okur" on public.art_weeks for select using (true);
create policy "hafta: admin yazar" on public.art_weeks
  for all using (public.is_admin()) with check (public.is_admin());

-- ————— Eserler —————
create table public.art_pieces (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.art_weeks(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  image_path text not null,               -- 'art' bucket'taki yol
  aciklama text,
  sosyal jsonb not null default '[]',      -- [{"tur":"instagram","url":"..."}]
  durum text not null default 'aktif'
    check (durum in ('aktif', 'elendi', 'sergide')),
  created_at timestamptz not null default now(),
  unique (week_id, creator_id)             -- HAFTADA 1 ESER
);

create index art_pieces_week_idx on public.art_pieces (week_id, durum);

alter table public.art_pieces enable row level security;
-- Doğrudan tablo okuması yalnız: kendi eseri (herhangi aşama) + admin. Herkesin
-- gördüğü sergi/oylama verisi aşağıdaki fonksiyonlardan gelir (anonimlik için).
create policy "eser: kendininkini görür" on public.art_pieces
  for select using (creator_id = auth.uid());
create policy "eser: admin görür" on public.art_pieces
  for select using (public.is_admin());
-- Üretici yalnız 'gonderim' aşamasındaki aktif haftaya, kendi adına ekler.
create policy "eser: gonderim aşamasında ekler" on public.art_pieces
  for insert with check (
    creator_id = auth.uid()
    and exists (
      select 1 from public.art_weeks w
      where w.id = week_id and w.durum = 'gonderim'
    )
  );
create policy "eser: admin günceller" on public.art_pieces
  for update using (public.is_admin()) with check (public.is_admin());

-- ————— Yardımcı: oy geçerli mi? (art_votes ilkesi bunu kullandığı için önce tanımlı) —————
create or replace function public.art_oy_gecerli(p_piece uuid, p_tur int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.art_pieces p
    join public.art_weeks w on w.id = p.week_id
    where p.id = p_piece
      and p.durum in ('aktif', 'sergide')
      and ((w.durum = 'eleme' and w.tur = p_tur) or (w.durum = 'sergi' and p_tur = 999))
  );
$$;

-- ————— Oylar (bir kullanıcı bir eseri bir turda bir kez) —————
create table public.art_votes (
  piece_id uuid not null references public.art_pieces(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  tur int not null,
  created_at timestamptz not null default now(),
  primary key (piece_id, voter_id, tur)
);

create index art_votes_sayim_idx on public.art_votes (piece_id, tur);

alter table public.art_votes enable row level security;
create policy "oy: kendi oyunu okur" on public.art_votes
  for select using (voter_id = auth.uid());
-- Oy geçerliliği (aktif eleme turu + eser o haftada aktif) fonksiyonla doğrulanır.
create policy "oy: kendi adına verir" on public.art_votes
  for insert with check (voter_id = auth.uid() and public.art_oy_gecerli(piece_id, tur));

-- ————— Bu haftanın durumu —————
create or replace function public.art_bu_hafta()
returns table (id uuid, hafta_no int, durum text, tur int, sergi_tarihi date)
language sql
stable
security definer
set search_path = public
as $$
  select w.id, w.hafta_no, w.durum, w.tur, w.sergi_tarihi
  from public.art_weeks w
  where w.durum in ('gonderim', 'eleme', 'sergi')
  order by w.created_at desc
  limit 1;
$$;

-- ————— ANONİM oylama seti: sahip bilgisi YOK, kullanıcının bu turda oylamadığı,
-- aktif eleme eserlerinden rastgele en çok N tane —————
create or replace function public.art_oy_seti(p_week uuid, p_adet int default 10)
returns table (id uuid, image_path text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tur int;
begin
  -- Alias şart: RETURNS TABLE'ın 'id' kolonu ile art_weeks.id çakışmasın (ambiguous)
  select w.tur into v_tur from public.art_weeks w
    where w.id = p_week and w.durum = 'eleme';
  if v_tur is null then
    return;  -- eleme aşamasında değil
  end if;
  return query
    select p.id, p.image_path
    from public.art_pieces p
    where p.week_id = p_week
      and p.durum = 'aktif'
      and p.creator_id <> auth.uid()  -- kendi eserini oylamaz
      and not exists (
        select 1 from public.art_votes v
        where v.piece_id = p.id and v.voter_id = auth.uid() and v.tur = v_tur
      )
    order by random()
    limit p_adet;
end;
$$;

-- ————— SERGİ: son 50, oy sayısına göre sıralı, SAHİPLİ (sergi aşamasında) —————
create or replace function public.art_sergi(p_week uuid)
returns table (
  id uuid,
  image_path text,
  aciklama text,
  sosyal jsonb,
  sahip_ad text,
  oy bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.image_path, p.aciklama, p.sosyal,
    pr.display_name,
    count(v.*)::bigint
  from public.art_pieces p
  join public.art_weeks w on w.id = p.week_id
  left join public.profiles pr on pr.id = p.creator_id
  left join public.art_votes v on v.piece_id = p.id
  where p.week_id = p_week and p.durum = 'sergide' and w.durum = 'sergi'
  group by p.id, pr.display_name
  order by count(v.*) desc, p.created_at asc
  limit 50;
$$;

-- ————— Kullanıcının bu haftaki kendi eseri (gönderdi mi?) —————
create or replace function public.art_benim_eserim(p_week uuid)
returns table (id uuid, image_path text, durum text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.image_path, p.durum
  from public.art_pieces p
  where p.week_id = p_week and p.creator_id = auth.uid();
$$;

-- ————— ADMIN: bir turdaki oyları sayıp en çok oylu p_kalan taneyi bırak, gerisini ele —————
create or replace function public.art_sonraki_tur(p_week uuid, p_kalan int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tur int;
  v_kalan int;
begin
  if not public.is_admin() then raise exception 'yalnız admin'; end if;
  select tur into v_tur from public.art_weeks where id = p_week and durum = 'eleme';
  if v_tur is null then raise exception 'hafta eleme aşamasında değil'; end if;

  -- Bu turda en çok oylu p_kalan eseri bul; gerisini 'elendi' yap
  with sirali as (
    select p.id,
           row_number() over (
             order by (select count(*) from public.art_votes v
                       where v.piece_id = p.id and v.tur = v_tur) desc,
                      p.created_at asc
           ) as sira
    from public.art_pieces p
    where p.week_id = p_week and p.durum = 'aktif'
  )
  update public.art_pieces p
    set durum = 'elendi'
    from sirali s
    where p.id = s.id and s.sira > p_kalan;

  -- Turu ilerlet
  update public.art_weeks set tur = tur + 1 where id = p_week;
  select count(*) into v_kalan from public.art_pieces
    where week_id = p_week and durum = 'aktif';
  return v_kalan;
end;
$$;

-- ————— ADMIN: kalan aktif eserleri sergiye al (en çok 50), hafta 'sergi' —————
create or replace function public.art_sergiye_al(p_week uuid, p_tarih date default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tur int;
  v_say int;
begin
  if not public.is_admin() then raise exception 'yalnız admin'; end if;
  select tur into v_tur from public.art_weeks where id = p_week and durum = 'eleme';
  if v_tur is null then raise exception 'hafta eleme aşamasında değil'; end if;

  -- Son turun en çok oylu 50'sini sergiye al, gerisini ele
  with sirali as (
    select p.id,
           row_number() over (
             order by (select count(*) from public.art_votes v
                       where v.piece_id = p.id and v.tur = v_tur) desc,
                      p.created_at asc
           ) as sira
    from public.art_pieces p
    where p.week_id = p_week and p.durum = 'aktif'
  )
  update public.art_pieces p
    set durum = case when s.sira <= 50 then 'sergide' else 'elendi' end
    from sirali s where p.id = s.id;

  update public.art_weeks
    set durum = 'sergi', sergi_tarihi = coalesce(p_tarih, (now() at time zone 'utc')::date)
    where id = p_week;  -- takvim UTC 00:00'a çıpalı: sergi günü = UTC tarihi
  select count(*) into v_say from public.art_pieces
    where week_id = p_week and durum = 'sergide';
  return v_say;
end;
$$;

-- ————— Yetkiler —————
grant execute on function public.art_bu_hafta() to anon, authenticated;
grant execute on function public.art_sergi(uuid) to anon, authenticated;
grant execute on function public.art_oy_seti(uuid, int) to authenticated;
grant execute on function public.art_benim_eserim(uuid) to authenticated;
revoke execute on function public.art_sonraki_tur(uuid, int) from public, anon;
revoke execute on function public.art_sergiye_al(uuid, date) from public, anon;
grant execute on function public.art_sonraki_tur(uuid, int) to authenticated;
grant execute on function public.art_sergiye_al(uuid, date) to authenticated;
