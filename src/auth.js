// Kimlik doğrulama: giriş/kayıt/çıkış + oturum ve profili birlikte veren useAuth() hook'u
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export function signIn(email, sifre) {
  return supabase.auth.signInWithPassword({ email, password: sifre });
}

export function signUp(email, sifre, gorunenAd) {
  return supabase.auth.signUp({
    email,
    password: sifre,
    options: { data: { display_name: gorunenAd } },
  });
}

export function signOut() {
  return supabase.auth.signOut();
}

// Google ile giriş (OAuth). Google onay ekranına yönlendirir; geri dönünce
// supabase-js URL'deki oturumu otomatik yakalar (detectSessionInUrl varsayılan).
// ÇALIŞMASI İÇİN: Supabase projesinde Google sağlayıcısı açık + Google Cloud'da
// OAuth istemcisi tanımlı olmalı (bkz. README "Google ile giriş"). Aksi halde
// Supabase bir yapılandırma hatası döndürür.
export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
}

// Şifre sıfırlama e-postası gönderir. Bağlantı bu siteye döner; supabase-js URL'deki
// recovery token'ını yakalayıp PASSWORD_RECOVERY olayını tetikler → yeni şifre ekranı.
// NOT (opsiyon adı): resetPasswordForEmail YALNIZCA `redirectTo`'yu okur — `emailRedirectTo`
// bu çağrıda YOK SAYILIR (o signUp/OTP içindir). Doğru anahtar burada kullanılıyor.
// Debug: isteği ve Supabase yanıtını konsola basar. resetPasswordForEmail güvenlik gereği
// (kullanıcı sayımını engellemek için) e-posta gerçekten gitmese de error=null döndürebilir;
// yani "error yok" teslim garantisi DEĞİLDİR — gerçek teslim Supabase Auth loglarından görülür.
export async function sifreSifirla(email) {
  const redirectTo = window.location.origin;
  console.log("[reset] resetPasswordForEmail →", { email, redirectTo });
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  console.log("[reset] Supabase yanıtı ←", { data, error });
  if (error) console.error("[reset] hata:", error.status, error.message);
  return { data, error };
}

// Recovery oturumunda yeni şifreyi kaydeder (updateUser). Başarılıysa kullanıcı
// artık o yeni şifreyle girmiş olur.
export function sifreGuncelle(yeniSifre) {
  return supabase.auth.updateUser({ password: yeniSifre });
}

// Oturum (session) + profil (profiles satırı) durumu
export function useAuth() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setYukleniyor(false);
    });
    const { data: abonelik } = supabase.auth.onAuthStateChange((_olay, oturum) => {
      setSession(oturum);
    });
    return () => abonelik.subscription.unsubscribe();
  }, []);

  const kullaniciId = session?.user?.id;

  useEffect(() => {
    if (!kullaniciId) {
      setProfile(null);
      return;
    }
    let aktif = true;
    profilGetir(kullaniciId).then((p) => {
      if (aktif) setProfile(p);
    });
    return () => {
      aktif = false;
    };
  }, [kullaniciId]);

  // Profil düzenleme sonrası elle tazeleme
  function profilYenile() {
    if (kullaniciId) profilGetir(kullaniciId).then(setProfile);
  }

  return { session, user: session?.user ?? null, profile, yukleniyor, profilYenile };
}

async function profilGetir(id) {
  const { data } = await supabase.from("profiles").select("*").eq("id", id).single();
  return data ?? null;
}
