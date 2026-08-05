// Vite yapılandırması — React eklentisi yeterli, ekstra ayar yok
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Atanmış PORT varsa onu kullan (harness/autoPort); yoksa Vite varsayılanı (5173).
  server: { port: process.env.PORT ? Number(process.env.PORT) : undefined },
});
