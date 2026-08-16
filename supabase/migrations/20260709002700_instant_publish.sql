-- Bu dosya sql/27_instant_publish.sql dosyasından üretildi — ELLE DÜZENLEME, sql/ altını değiştirip
-- `npm run db:sync` çalıştır.

-- M1: Anında yayın — bir video 'approved' olur olmaz ana başlık otomatik 'published'.
-- Sorun: moderasyon boru hattı (moderate-tier1 / moderate-tier2, service_role ile) yalnız
-- videos.status'u 'approved' yapıyordu; titles'ı YAYINLAMIYORDU. getCatalog ise
-- titles.status='published' ister → boru hattıyla onaylanan video feed'e HİÇ düşmüyordu.
-- Yalnız elle AdminPanel.onayla başlığı yayınlıyordu.
--
-- Çözüm: onayı TEK noktada yayına bağlayan trigger. Böylece hangi yol onaylarsa onaylasın
-- (AdminPanel, Tier 1 kısa devre, Tier 2 batch) başlık anında feed'e düşer. Festival/oylama
-- sonucundan BAĞIMSIZ (görev: "moderasyondan sonra hemen yayınla, sonucu bekletme").
-- AdminPanel'deki istemci-tarafı titles update artık gereksiz ama zararsız yedek olarak kalır.

create or replace function public.video_onayinda_yayinla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Yalnız 'approved'a GEÇİŞTE çalış (idempotent: tekrar approved update tetiklemez)
  if new.status = 'approved' and (old.status is distinct from 'approved') then
    -- Videonun kendi published_at'i boşsa doldur (feed sıralaması published_at'e göre)
    if new.published_at is null then
      new.published_at := now();
    end if;
    -- Ana başlık hâlâ taslaksa yayınla → anında feed'e düşer
    update public.titles
      set status = 'published',
          published_at = coalesce(published_at, now())
      where id = new.title_id and status = 'draft';
  end if;
  return new;
end;
$$;

-- BEFORE UPDATE OF status: yalnız status SET listesindeyse tetiklenir (published_at-only
-- güncellemelerde boşa çalışmaz). titles'ı güncellediği için videos'ta özyineleme yok.
drop trigger if exists trg_video_onayinda_yayinla on public.videos;
create trigger trg_video_onayinda_yayinla
  before update of status on public.videos
  for each row execute function public.video_onayinda_yayinla();
