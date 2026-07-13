// Kimlik: giriş/kayıt/çıkış + oturumu izleyen useAuth() hook'u (web'deki auth.js ile
// aynı örüntü, mobil sürüm). Oturum supabase-js tarafından AsyncStorage'da tutulur.
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

// Oturum durumu — açılışta AsyncStorage'dan yüklenir, değişimleri dinler
export function useAuth() {
  const [user, setUser] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setYukleniyor(false);
    });
    const { data: abonelik } = supabase.auth.onAuthStateChange((_olay, oturum) => {
      setUser(oturum?.user ?? null);
    });
    return () => abonelik.subscription.unsubscribe();
  }, []);

  return { user, yukleniyor };
}
