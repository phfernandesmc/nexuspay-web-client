import { QueryClient } from "@tanstack/react-query";

/**
 * Uma fabrica, nao um singleton exportado.
 *
 * Cada teste precisa do proprio cache: um cliente compartilhado faria o
 * resultado de um teste vazar para o seguinte, e o sintoma seria uma falha
 * que so aparece quando a suite roda inteira.
 */
export function criarQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Decisao do dono: nada busca sozinho. Sem timer, sem refetch ao
        // voltar para a aba. Os dados ainda renovam ao navegar, porque a
        // consulta remonta e busca de novo se estiver velha.
        refetchOnWindowFocus: false,
        // O interceptor de lib/http.ts ja renova a sessao e repete a
        // requisicao uma vez. Repetir de novo aqui multiplicaria chamadas
        // num 500 e atrasaria o erro que o usuario precisa ver.
        retry: false,
      },
    },
  });
}
