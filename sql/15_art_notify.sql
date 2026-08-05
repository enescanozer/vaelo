-- 15_art_notify.sql — "Tablo" bildirimleri (oylama açıldı / sergi yayında)
-- 14_art.sql'den SONRA çalıştır. Uygulama içi zil + e-posta (notify-new-content) aynı
-- notifications tablosunu kullanır.
--
-- Haftalık takvim UTC 00:00'a çıpalıdır:
--   • Cuma 00:00 UTC → eleme başlar (rastgele "bildirim alanlar" oylar, tur tur ~50'ye iner)
--   • Cumartesi 00:00 UTC → sergi yayında (sahipli, herkese bildirilir)
-- Otomasyon (cron) prod'a çıkınca eklenir; şimdilik admin panelinden manuel tetiklenir.
-- Bildirimler durum/tur değişiminde tetikleyiciyle kuyruğa düşer.

-- ————— notifications tablosunu Tablo için genişlet —————
alter table public.notifications
  add column if not exists art_week_id uuid references public.art_weeks(id) on delete cascade;

-- kind kısıtına art türlerini ekle (eski kısıtı düşür, yenisini kur)
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('yeni_bolum', 'yeni_icerik', 'art_eleme', 'art_sergi'));

-- Oylamaya çağrılacak rastgele örneklem boyutu (tur 1). Admin panelden/SQL'den değişir.
insert into public.app_settings (key, value) values ('art_eleme_orneklem', '5000')
  on conflict (key) do nothing;

-- ————— Kuyruğa düşür: p_kind bildirimini örneklem kadar (veya herkese) kullanıcıya —————
-- p_orneklem null → herkese (sergi). Değilse rastgele o kadar kişiye (eleme turu).
create or replace function public.art_bildirim_kuyrukla(p_week uuid, p_kind text, p_orneklem int default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_say int;
begin
  if p_orneklem is null then
    insert into public.notifications (user_id, art_week_id, kind)
    select pr.id, p_week, p_kind from public.profiles pr;
  else
    insert into public.notifications (user_id, art_week_id, kind)
    select pr.id, p_week, p_kind from public.profiles pr
    order by random()
    limit p_orneklem;
  end if;
  get diagnostics v_say = row_count;
  return v_say;
end;
$$;

-- ————— Tetikleyici: hafta durumu değişince bildir —————
create or replace function public.art_hafta_bildirim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orneklem int;
begin
  -- Eleme başladı (tur 1): oy verecek rastgele örneklem
  if new.durum = 'eleme' and old.durum is distinct from 'eleme' then
    select coalesce((select value::int from public.app_settings where key = 'art_eleme_orneklem'), 5000)
      into v_orneklem;
    perform public.art_bildirim_kuyrukla(new.id, 'art_eleme', v_orneklem);
  -- Sergi yayında: herkese
  elsif new.durum = 'sergi' and old.durum is distinct from 'sergi' then
    perform public.art_bildirim_kuyrukla(new.id, 'art_sergi', null);
  end if;
  return new;
end;
$$;

drop trigger if exists art_weeks_bildirim on public.art_weeks;
create trigger art_weeks_bildirim
  after update on public.art_weeks
  for each row execute function public.art_hafta_bildirim();

-- ————— art_sonraki_tur'u bildirimli sürümle değiştir: her yeni tur, TAZE rastgele
-- örneklemi oylamaya çağırır (kalan esere göre ölçekli) —————
create or replace function public.art_sonraki_tur(p_week uuid, p_kalan int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tur int;
  v_kalan int;
  v_ornek int;
begin
  if not public.is_admin() then raise exception 'yalnız admin'; end if;
  select tur into v_tur from public.art_weeks where id = p_week and durum = 'eleme';
  if v_tur is null then raise exception 'hafta eleme aşamasında değil'; end if;

  -- Bu turda en çok oylu p_kalan eseri bırak; gerisini 'elendi' yap
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

  -- Yeni turu taze örnekleme bildir (her oy veren ~10 esere bakar; kalan esere göre ölçekli)
  if v_kalan > 0 then
    v_ornek := greatest(v_kalan * 5, 100);
    perform public.art_bildirim_kuyrukla(p_week, 'art_eleme', v_ornek);
  end if;

  return v_kalan;
end;
$$;

-- ————— Yetkiler (helper yalnız trigger/admin fonksiyon içinden çağrılır) —————
revoke execute on function public.art_bildirim_kuyrukla(uuid, text, int) from public, anon, authenticated;
grant execute on function public.art_sonraki_tur(uuid, int) to authenticated;
