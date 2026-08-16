// Kimlik doğrulama: giriş/kayıt/çıkış + oturum ve profili birlikte veren useAuth() hook'u
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export function signIn(email, sifre) {
  return supabase.auth.signInWithPassword({ email, password: sifre });
}

export function signUp(email, sifre, gorunenAd) {
  // Paylaşım linkiyle (?ref=<uretici_id>) gelindiyse referansı kayıt metadata'sına ekle.
  // Sunucu tetikleyicisi (handle_new_user) yalnız gerçek creator/admin id'sini kabul eder.
  let ref = null;
  try {
    ref = localStorage.getItem("vaelo_ref") || null;
  } catch {
    /* localStorage erişilemezse ref'siz devam */
  }
  return supabase.auth.signUp({
    email,
    password: sifre,
    options: { data: { display_name: gorunenAd, ...(ref ? { ref } : {}) } },
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
// NOT: resetPasswordForEmail YALNIZCA `redirectTo`'yu okur — `emailRedirectTo` bu çağrıda
// yok sayılır (o signUp/OTP içindir). redirectTo origin'i Supabase Redirect URLs
// allowlist'inde olmalı; teslim Resend SMTP (doğrulanmış gönderen domaini) üzerinden yapılır.
export async function sifreSifirla(email) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) console.error("Şifre sıfırlama hatası:", error.message);
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
