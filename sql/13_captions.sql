-- 13_captions.sql — Alt yazı desteği
-- 12_moderation.sql'den SONRA çalıştır. Alt yazı DOSYALARI Cloudflare Stream'de
-- tutulur (add-caption Edge Function yükler); bu sütun yalnızca hangi dillerin
-- mevcut olduğunu kaydeder (Stüdyo listesi + gelecekte dil menüsü için).

alter table public.videos
  add column if not exists captions text[] not null default '{}';

-- Stüdyo'nun alt yazı ekleyebilmesi için creator_stats artık cf_uid + captions döndürür.
-- Dönüş tipi değiştiği için CREATE OR REPLACE yetmez — önce DROP gerekir (Postgres kuralı).
drop function if exists public.creator_stats();
create function public.creator_stats()
returns table (
  bolum_id uuid,
  cf_uid text,
  baslik_ad text,
  bolum_ad text,
  sezon int,
  bolum int,
  durum text,
  captions text[],
  izlenme bigint,
  toplam_saniye numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'giris gerekli';
  end if;
  return query
    select
      v.id,
      v.cf_uid,
      tt.name,
      v.name,
      v.season,
      v.episode,
      v.status,
      v.captions,
      count(w.id)::bigint,
      coalesce(sum(w.seconds), 0)
    from public.videos v
    join public.titles tt on tt.id = v.title_id
    left join public.watch_events w on w.video_id = v.id
    where v.creator_id = auth.uid()
    group by v.id, tt.name, tt.created_at, v.name, v.season, v.episode, v.status, v.captions
    order by tt.created_at desc, v.season nulls first, v.episode nulls first;
end;
$$;

-- DROP grant'ı da siler; yeniden ver (05_retention.sql ile aynı yetki)
revoke execute on function public.creator_stats() from public, anon;
grant execute on function public.creator_stats() to authenticated;
