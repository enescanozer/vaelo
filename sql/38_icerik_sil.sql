-- 38 — Üretici kendi içeriğini profil sayfasından siler.
-- Cascade (sql/01,05,10,26): videos → watch_events + video_ratings, my_list, contest_entries/votes.
-- Yetki: yalnız içeriğin sahibi (creator_id = auth.uid()) ya da admin.
create or replace function public.icerik_sil(p_title uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select creator_id into v_owner from public.titles where id = p_title;
  if v_owner is null then
    raise exception 'icerik bulunamadi';
  end if;
  if v_owner is distinct from auth.uid() and not public.is_admin() then
    raise exception 'yalnizca sahibi veya admin silebilir';
  end if;
  delete from public.titles where id = p_title;
end;
$$;
grant execute on function public.icerik_sil(uuid) to authenticated;
