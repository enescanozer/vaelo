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
