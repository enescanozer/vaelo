-- 09_audit.sql — Denetim kaydı: video/başlık durum değişimlerini kim yaptı, izler.
-- 08'den sonra çalıştır. Kayıtlar tetikleyiciyle otomatik düşer; panel son işlemleri gösterir.

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid,               -- işlemi yapan kullanıcı (webhook/servis işlemlerinde boş)
  tablo text not null,
  kayit uuid not null,
  eylem text not null,      -- örn. videos_approved, titles_published
  detay jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_idx on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

-- Yalnızca admin okur; yazma yalnızca tetikleyici üzerinden (insert ilkesi yok)
create policy "denetim: admin okur" on public.audit_log
  for select using (public.is_admin());

create or replace function public.durum_degisimini_kaydet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.audit_log (actor, tablo, kayit, eylem, detay)
    values (
      auth.uid(),
      tg_table_name,
      new.id,
      tg_table_name || '_' || new.status,
      jsonb_build_object('eski', old.status, 'yeni', new.status)
    );
  end if;
  return new;
end;
$$;

create trigger videos_denetim
  after update on public.videos
  for each row execute function public.durum_degisimini_kaydet();

create trigger titles_denetim
  after update on public.titles
  for each row execute function public.durum_degisimini_kaydet();
