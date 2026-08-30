import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { CHAVES, useContas } from "@/features/account/queries";
import { buscarExtrato } from "@/features/statement/api";
import { juntarRecentes } from "@/features/statement/recentes";

/**
 * Extrato paginado pelo cursor do gateway.
 *
 * A ordem das propriedades importa: na v5 o TanStack Query infere o tipo do
 * pageParam a partir de queryFn e initialPageParam, e getNextPageParam
 * precisa vir depois. E initialPageParam e OBRIGATORIO na v5 — na v4 ele
 * vinha do valor padrao no destructuring do queryFn, que nao existe mais.
 */
export function useExtrato(contaId: string) {
  return useInfiniteQuery({
    queryKey: CHAVES.extrato(contaId),
    queryFn: ({ pageParam }) => buscarExtrato(contaId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (ultimaPagina) => ultimaPagina.next_cursor,
  });
}

/**
 * As transacoes mais recentes entre todas as contas do usuario.
 *
 * O gateway so tem extrato por conta, entao sao N requisicoes em paralelo,
 * uma por conta, cada uma pedindo apenas `limite` itens. Com o punhado de
 * contas que uma pessoa tem, isso custa menos que um endpoint novo — e a
 * fusao vive em juntarRecentes, testada sozinha.
 */
export function useAtividadeRecente(limite = 5) {
  const { data: contas } = useContas();
  const ids = (contas ?? []).map((conta) => conta.id);

  return useQuery({
    queryKey: CHAVES.atividadeRecente(ids),
    queryFn: async () => {
      const todas = contas ?? [];
      // Promise.all preserva a ordem de entrada, entao o indice casa conta
      // com pagina. O pareamento e feito aqui e verificado em recentes.test:
      // trocar conta por pagina nao quebraria nada visivel, so exibiria o
      // banco errado numa linha.
      const paginas = await Promise.all(
        todas.map((conta) => buscarExtrato(conta.id, null, limite)),
      );
      return juntarRecentes(
        todas.map((conta, indice) => ({ conta, pagina: paginas[indice] })),
        limite,
      );
    },
    enabled: contas !== undefined,
  });
}
