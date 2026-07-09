import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Expose aussi les variables NEXT_PUBLIC_* créées par l'intégration Vercel↔Supabase
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
});
