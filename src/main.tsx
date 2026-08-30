import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "@/App";
import { criarQueryClient } from "@/app/queryClient";
import { ligarTema, temaInicial } from "@/lib/tema";
import "@/app/i18n";
import "@/index.css";

// Antes de renderizar: a classe precisa estar no <html> na primeira pintura,
// senao a tela aparece clara e escurece depois — o "flash" branco.
ligarTema(temaInicial());

const queryClient = criarQueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
