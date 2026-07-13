// Mobil Supabase istemcisi — oturum AsyncStorage'da kalıcı (uygulama yeniden
// açılınca giriş korunur). URL/anon anahtar config.js'ten (TEK yer).
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // mobilde URL yok
  },
});
