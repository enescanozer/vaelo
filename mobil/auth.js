// Kimlik: giriş/kayıt/çıkış + oturumu izleyen useAuth() hook'u (web'deki auth.js ile
// aynı örüntü, mobil sürüm). Oturum supabase-js tarafından AsyncStorage'da tutulur.
import { useEffect, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { supabase } from "./supabaseClient";

// Tarayıcı auth oturumundan dönünce bekleyen akışı kapat (standart Expo çağrısı)
WebBrowser.maybeCompleteAuthSession();

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

// Redirect URL'indeki (implicit → #hash, PKCE → ?query) parametreleri ayrıştır
function urlParametreleri(url) {
  const sonuc = {};
  const idx = [url.indexOf("?"), url.indexOf("#")].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (idx == null) return sonuc;
  // ? ve # sonrasını & ile birleştirip tara (hem implicit hash hem pkce query yakalanır)
  const ham = url.slice(idx + 1).replace(/[?#]/g, "&");
  for (const ikili of ham.split("&")) {
    if (!ikili) continue;
    const esit = ikili.indexOf("=");
    const k = esit >= 0 ? ikili.slice(0, esit) : ikili;
    const v = esit >= 0 ? ikili.slice(esit + 1) : "";
    sonuc[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return sonuc;
}

// Google ile giriş (Expo): Supabase OAuth URL'ini alır, sistem tarayıcısında açar,
// dönüşteki oturumu (token ya da code) supabase-js'e yazar. Redirect ORTAMA GÖRE:
// Expo Go → exp://<ip>:<port>/--/auth-callback, gerçek build → vaelo://auth-callback
// (scheme zorlanmaz → openAuthSessionAsync her iki ortamda da dönüşü yakalar).
// ÇALIŞMASI İÇİN: Supabase → Auth → URL Configuration → Redirect URLs allowlist'inde
// bu redirect URL (Expo Go'da exp://..., build'de vaelo://auth-callback) kayıtlı olmalı;
// yoksa Supabase Site URL'e (web'e) düşürür.
export async function signInWithGoogle() {
  const redirectUrl = AuthSession.makeRedirectUri({ path: "auth-callback" });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
  });
  if (error) return { error };
  if (!data?.url) return { error: new Error("OAuth URL alınamadı") };

  const sonuc = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
  if (sonuc.type !== "success" || !sonuc.url) return { error: null, iptal: true };

  const p = urlParametreleri(sonuc.url);
  if (p.access_token && p.refresh_token) {
    const { error: setHata } = await supabase.auth.setSession({
      access_token: p.access_token,
      refresh_token: p.refresh_token,
    });
    return { error: setHata };
  }
  if (p.code) {
    const { error: exHata } = await supabase.auth.exchangeCodeForSession(p.code);
    return { error: exHata };
  }
  return { error: new Error("Oturum bilgisi alınamadı") };
}

// ————— Şifre sıfırlama (mobil) —————
// Sıfırlama e-postası gönderir (Supabase yerleşik akışı). Bağlantı vaelo://reset-password
// olarak döner; detectSessionInUrl mobilde kapalı olduğundan App.js deep-link'i elle yakalar.
// ÇALIŞMASI İÇİN: Supabase redirect allowlist'inde "vaelo://reset-password" kayıtlı olmalı.
export function sifreSifirla(email) {
  const redirectUrl = AuthSession.makeRedirectUri({ scheme: "vaelo", path: "reset-password" });
  return supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
}

// Recovery oturumunda yeni şifreyi kaydeder. Google ile açılmış (şifresiz) hesapta da
// çalışır: aynı e-postaya sıfırlama gider → updateUser AYNI kullanıcıya şifre yazar
// (yeni/yinelenen hesap OLUŞMAZ). Böylece kullanıcı sonrasında e-posta+şifre ile de girebilir.
export function sifreGuncelle(yeniSifre) {
  return supabase.auth.updateUser({ password: yeniSifre });
}

// reset-password deep link'inden recovery oturumunu kurar (token ya da code).
// Başarılıysa true → App.js "yeni şifre belirle" modalını açar.
export async function recoveryOturumuKur(url) {
  const p = urlParametreleri(url);
  if (p.access_token && p.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: p.access_token,
      refresh_token: p.refresh_token,
    });
    return !error;
  }
  if (p.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(p.code);
    return !error;
  }
  return false;
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
