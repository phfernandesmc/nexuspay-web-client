import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    // strictPort e obrigatorio: o CORS do gateway libera exatamente
    // http://localhost:5173. Sem isso o Vite cai para 5174 quando a porta
    // esta ocupada, e toda requisicao passa a falhar por CORS — um sintoma
    // que nao se parece nem um pouco com "porta errada".
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // Fixa a URL nos testes. Sem isto, um .env local apontando para outro
    // host faria o cliente pedir num endereco e o MSW responder noutro — e a
    // falha apareceria como "requisicao nao mockada", que nao sugere .env.
    env: { VITE_API_URL: "http://localhost:8000/api/v1" },
  },
});
