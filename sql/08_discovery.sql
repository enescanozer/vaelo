-- 08_discovery.sql — Keşif: Postgres tam metin arama (turkish tsvector)
-- 07'den sonra çalıştır. İstemci .textSearch("search_vec", ...) kullanır;
-- bu dosya çalıştırılmadıysa arama otomatik olarak ilike'a düşer.

alter table public.titles add column search_vec tsvector
  generated always as (
    to_tsvector(
      'turkish',
      coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(genre, '')
    )
  ) stored;

create index titles_search_idx on public.titles using gin (search_vec);
