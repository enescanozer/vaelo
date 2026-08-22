-- 40 — Üretici başvurusuna pilot (örnek) video: 'pilot' Storage bucket + başvuru alanları.
-- Yalnız bu akışa dokunur (başvuru + admin onay). Mevcut video yükleme (CF Stream) ayrı kalır.

alter table public.creator_basvurulari
  add column if not exists pilot_video_url text,
  add column if not exists pilot_video_path text;

-- Admin liste RPC'sine pilot_video_url eklendi (dönüş tipi değiştiği için DROP + CREATE)
drop function if exists public.creator_basvuru_listesi();
create function public.creator_basvuru_listesi()
returns table (user_id uuid, ad text, mesaj text, durum text, created_at timestamptz, pilot_video_url text)
language sql
stable
security definer
set search_path = public
as $$
  select b.user_id, pr.display_name, b.mesaj, b.durum, b.created_at, b.pilot_video_url
  from public.creator_basvurulari b
  left join public.profiles pr on pr.id = b.user_id
  where public.is_admin()
  order by (b.durum = 'beklemede') desc, b.created_at desc;
$$;
grant execute on function public.creator_basvuru_listesi() to authenticated;

-- 'pilot' bucket (public playback; admin başvuruyu değerlendirirken izler). Video türleri, 300 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pilot', 'pilot', true, 314572800,
        array['video/mp4','video/quicktime','video/webm','video/x-matroska','video/x-m4v'])
on conflict (id) do update
  set public = true, file_size_limit = 314572800,
      allowed_mime_types = array['video/mp4','video/quicktime','video/webm','video/x-matroska','video/x-m4v'];

-- Storage RLS: kullanıcı kendi klasörüne (uid/) yükler + siler; okuma public URL ile.
drop policy if exists "pilot: kendi yukler" on storage.objects;
create policy "pilot: kendi yukler" on storage.objects for insert to authenticated
  with check (bucket_id = 'pilot' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pilot: kendi siler" on storage.objects;
create policy "pilot: kendi siler" on storage.objects for delete to authenticated
  using (bucket_id = 'pilot' and (storage.foldername(name))[1] = auth.uid()::text);
