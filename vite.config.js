// Vite yapılandırması — React eklentisi yeterli, ekstra ayar yok
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
