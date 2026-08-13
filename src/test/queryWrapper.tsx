import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { criarQueryClient } from "@/app/queryClient";

/**
 * Monta a arvore com um QueryClient NOVO a cada chamada.
 *
 * Reaproveitar o cliente entre testes faria um teste enxergar o cache do
 * anterior, e a falha so apareceria com a suite inteira rodando.
 */
export function envolverComQuery(ui: ReactNode) {
  return render(
    <QueryClientProvider client={criarQueryClient()}>{ui}</QueryClientProvider>,
  );
}
