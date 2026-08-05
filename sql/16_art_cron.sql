-- 16_art_cron.sql — "Tablo" haftalık döngü otomasyonu (UTC 00:00 çıpalı)
-- 15_art_notify.sql'den SONRA çalıştır.
--
-- Tüm mantık tek fonksiyonda toplanır: art_lifecycle_ilerlet(). Edge function
-- (supabase/functions/art-cron) bunu service_role ile çağıran ince bir tetikleyicidir.
-- is_admin() yerine yalnız service_role'a grant ile korunur (cron auth.uid()'siz çalışır).
--
-- Haftalık takvim (hepsi UTC):
--   Pazar–Perşembe : gönderim penceresi (aktif hafta yoksa yeni 'gonderim' açılır)
--   Cuma 00:00     : gönderim → eleme (tur 1; art_eleme bildirimi tetikleyiciyle düşer)
--   Cuma gün içi   : her çağrıda aktif eser sayısı 10× azaltılarak 50'ye indirilir
--   Cumartesi 00:00: eleme → sergi (en çok oylu 50; art_sergi bildirimi düşer)
--   Sergi tarihi geçince (Pazar): sergi → 'bitti', yeni gönderim haftası açılır
--
-- İdempotent: aynı gün tekrar çağrılırsa yalnız gerekli geçişi yapar.

create or replace function public.art_lifecycle_ilerlet(p_now timestamptz default now())
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_utc   timestamp := p_now at time zone 'utc';   -- UTC duvar saati
  v_dow   int       := extract(dow  from v_utc);   -- 0=Pazar … 5=Cuma 6=Cumartesi
  v_date  date      := v_utc::date;
  v_week  public.art_weeks%rowtype;
  v_aktif int;
  v_hedef int;
begin
  -- Aktif hafta (gonderim/eleme/sergi) — en yenisi
  select * into v_week from public.art_weeks
    where durum in ('gonderim', 'eleme', 'sergi')
    order by created_at desc limit 1;

  -- 1) Süresi dolmuş sergiyi kapat (sergi_tarihi bugünden önce → 'bitti')
  if v_week.id is not null and v_week.durum = 'sergi'
     and v_week.sergi_tarihi is not null and v_week.sergi_tarihi < v_date then
    update public.art_weeks set durum = 'bitti' where id = v_week.id;
    v_week.id := null;  -- artık aktif hafta yok
  end if;

  -- 2) Aktif hafta yok + gönderim penceresi (Cts/Cuma dışı) → yeni gönderim haftası
  if v_week.id is null then
    if v_dow not in (5, 6) then
      insert into public.art_weeks (hafta_no, durum)
        values ((select coalesce(max(hafta_no), 0) + 1 from public.art_weeks), 'gonderim');
      return 'yeni gönderim haftası açıldı';
    end if;
    return 'aktif hafta yok (gönderim penceresi dışı)';
  end if;

  -- 3) Cuma: gönderim → eleme, ardından 50'ye doğru ele
  if v_dow = 5 then
    if v_week.durum = 'gonderim' then
      update public.art_weeks set durum = 'eleme', tur = 1 where id = v_week.id;
      return 'eleme başladı (tur 1)';
    elsif v_week.durum = 'eleme' then
      select count(*) into v_aktif from public.art_pieces
        where week_id = v_week.id and durum = 'aktif';
      if v_aktif > 50 then
        v_hedef := greatest(50, ceil(v_aktif / 10.0)::int);  -- her turda ~10× ele
        perform public.art_tur_uygula(v_week.id, v_hedef, false, null);
        return format('tur ilerledi: %s → %s', v_aktif, v_hedef);
      end if;
      return 'eleme: 50 veya altı, sergi bekliyor';
    end if;
  end if;

  -- 4) Cumartesi: sergiye al (en çok oylu 50). Cuma geçişi kaçmış olsa bile (hafta hâlâ
  --    'gonderim') yine top 50'yi doğrudan sergiye alır → her hâlükârda 50 garanti.
  if v_dow = 6 and v_week.durum in ('gonderim', 'eleme') then
    perform public.art_tur_uygula(v_week.id, 50, true, v_date);
    return 'sergiye alındı';
  end if;

  return 'değişiklik yok';
end;
$$;

-- ————— Çekirdek eleme/sergi mantığı (kapısız; hem cron hem admin RPC kullanır) —————
-- p_sergi=false → en çok oylu p_kalan'ı bırak, gerisini 'elendi', turu ilerlet.
-- p_sergi=true  → en çok oylu p_kalan'ı 'sergide', gerisini 'elendi', hafta 'sergi'.
create or replace function public.art_tur_uygula(p_week uuid, p_kalan int, p_sergi bool, p_tarih date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tur int;
  v_say int;
begin
  -- Sergiye alma (p_sergi) Cuma kaçmışsa 'gonderim'den de çalışır; eleme turu ise
  -- yalnız 'eleme'de. gonderim'de oy olmadığından sıralama tümüyle rastgele → adil 50.
  if p_sergi then
    select coalesce(tur, 0) into v_tur from public.art_weeks
      where id = p_week and durum in ('gonderim', 'eleme');
  else
    select tur into v_tur from public.art_weeks where id = p_week and durum = 'eleme';
  end if;
  if v_tur is null then raise exception 'hafta gonderim/eleme aşamasında değil'; end if;

  -- Oyları TEK gruplu taramada say (eser başına ilişkili alt-sorgu yerine — turnuva
  -- ölçeğinde çok daha hızlı; art_votes_sayim_idx (piece_id,tur) kullanılır).
  -- Sıralama: önce oy sayısı (gerçek seçim), EŞİTLİKTE rastgele. Böylece kimse oylamasa
  -- da (ya da az oylasa da) 50 yine ADİL rastgele dolar — 'en erken gönderen' avantajı yok.
  with oylar as (
    select v.piece_id, count(*) as n
    from public.art_votes v
    join public.art_pieces p on p.id = v.piece_id
    where p.week_id = p_week and v.tur = v_tur
    group by v.piece_id
  ),
  sirali as (
    select p.id,
           row_number() over (
             order by coalesce(o.n, 0) desc, random()
           ) as sira
    from public.art_pieces p
    left join oylar o on o.piece_id = p.id
    where p.week_id = p_week and p.durum = 'aktif'
  )
  update public.art_pieces p
    set durum = case
                  when s.sira > p_kalan then 'elendi'
                  when p_sergi then 'sergide'
                  else 'aktif'
                end
    from sirali s
    where p.id = s.id and (s.sira > p_kalan or p_sergi);

  if p_sergi then
    update public.art_weeks
      set durum = 'sergi', sergi_tarihi = coalesce(p_tarih, (now() at time zone 'utc')::date)
      where id = p_week;
    select count(*) into v_say from public.art_pieces
      where week_id = p_week and durum = 'sergide';
  else
    update public.art_weeks set tur = tur + 1 where id = p_week;
    -- Yeni tura taze rastgele örneklemi bildir (kalan esere göre ölçekli)
    select count(*) into v_say from public.art_pieces
      where week_id = p_week and durum = 'aktif';
    if v_say > 0 then
      perform public.art_bildirim_kuyrukla(p_week, 'art_eleme', greatest(v_say * 5, 100));
    end if;
  end if;
  return v_say;
end;
$$;

-- ————— Admin RPC'leri çekirdek mantığa bağla (tek kaynak) —————
create or replace function public.art_sonraki_tur(p_week uuid, p_kalan int)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'yalnız admin'; end if;
  return public.art_tur_uygula(p_week, p_kalan, false, null);
end;
$$;

create or replace function public.art_sergiye_al(p_week uuid, p_tarih date default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'yalnız admin'; end if;
  return public.art_tur_uygula(p_week, 50, true, p_tarih);
end;
$$;

-- ————— Yetkiler: çekirdek + döngü yalnız service_role/admin RPC içinden —————
revoke execute on function public.art_tur_uygula(uuid, int, bool, date) from public, anon, authenticated;
revoke execute on function public.art_lifecycle_ilerlet(timestamptz) from public, anon, authenticated;
grant execute on function public.art_lifecycle_ilerlet(timestamptz) to service_role;
grant execute on function public.art_sonraki_tur(uuid, int) to authenticated;
grant execute on function public.art_sergiye_al(uuid, date) to authenticated;
