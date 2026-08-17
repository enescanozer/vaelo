-- Bu dosya sql/36_user_moderation.sql dosyasından üretildi — ELLE DÜZENLEME, sql/ altını değiştirip
-- `npm run db:sync` çalıştır.

-- 36_user_moderation.sql — Forum kullanıcı yaptırımları (warning / mute / ban).
-- Geçici mute: expires_at ile. forum-post Edge Function mesaj yazmadan ÖNCE aktif_yaptirim'ı
-- kontrol eder (backend zorunlu). 35_forum.sql'den sonra çalıştır.

create table public.user_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('warning', 'mute', 'ban')),
  reason text,
  expires_at timestamptz,  -- null → süresiz (ban) / kalıcı; mute'ta genelde dolu
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index user_mod_actions_user_idx on public.user_moderation_actions (user_id, created_at desc);

alter table public.user_moderation_actions enable row level security;
-- Kullanıcı kendi yaptırımlarını görür (mute uyarısı için); yetkili hepsini. INSERT yok (RPC).
create policy "yaptirim: kendi gorur" on public.user_moderation_actions
  for select using (user_id = auth.uid());
create policy "yaptirim: yetkili gorur" on public.user_moderation_actions
  for select using (public.is_moderator());

-- Aktif engelleyici yaptırım: 'ban' > 'mute'; süresi geçmemiş (warning engellemez). null döner → serbest.
create or replace function public.aktif_yaptirim(p_user uuid)
returns text
language sql stable security definer set search_path = public as $$
  select action from public.user_moderation_actions
  where user_id = p_user and action in ('mute', 'ban')
    and (expires_at is null or expires_at > now())
  order by case action when 'ban' then 2 else 1 end desc, created_at desc
  limit 1;
$$;
grant execute on function public.aktif_yaptirim(uuid) to authenticated, service_role;

-- Yaptırım uygula (yetkili) — user_moderation_actions + audit_log'a da yazar (DenetimKaydi).
create or replace function public.forum_yaptirim_uygula(
  p_user uuid, p_action text, p_reason text, p_expires timestamptz
)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_moderator() then raise exception 'yalniz yetkili'; end if;
  if p_action not in ('warning', 'mute', 'ban') then raise exception 'gecersiz eylem'; end if;
  insert into public.user_moderation_actions (user_id, action, reason, expires_at, created_by)
  values (p_user, p_action, p_reason, p_expires, auth.uid())
  returning id into v_id;
  insert into public.audit_log (actor, tablo, kayit, eylem, detay)
  values (auth.uid(), 'user_moderation_actions', v_id, 'forum_' || p_action,
          jsonb_build_object('user', p_user, 'reason', p_reason, 'expires_at', p_expires));
end; $$;
revoke execute on function public.forum_yaptirim_uygula(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.forum_yaptirim_uygula(uuid, text, text, timestamptz) to authenticated;

-- Yaptırım geçmişi (yetkili) — kim/kime/ne/neden/ne zaman/süre (uygulayan display_name ile).
create or replace function public.forum_yaptirim_gecmisi(p_user uuid)
returns table (
  id uuid, action text, reason text, expires_at timestamptz,
  created_at timestamptz, uygulayan text
)
language sql security definer set search_path = public as $$
  select a.id, a.action, a.reason, a.expires_at, a.created_at, pr.display_name
  from public.user_moderation_actions a
  left join public.profiles pr on pr.id = a.created_by
  where public.is_moderator() and a.user_id = p_user
  order by a.created_at desc;
$$;
revoke execute on function public.forum_yaptirim_gecmisi(uuid) from public, anon;
grant execute on function public.forum_yaptirim_gecmisi(uuid) to authenticated;

-- Kullanıcı ara (yetkili): nickname ile; aktif yaptırımı da döner. profiles self-only RLS'i aşar.
create or replace function public.forum_kullanici_ara(p_q text)
returns table (id uuid, display_name text, role text, aktif_yaptirim text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.role, public.aktif_yaptirim(p.id)
  from public.profiles p
  where public.is_moderator() and p.display_name ilike '%' || p_q || '%'
  order by p.display_name
  limit 20;
$$;
revoke execute on function public.forum_kullanici_ara(text) from public, anon;
grant execute on function public.forum_kullanici_ara(text) to authenticated;
