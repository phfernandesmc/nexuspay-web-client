import { useInfiniteQuery } from "@tanstack/react-query";
import { CHAVES } from "@/features/account/queries";
import { buscarExtrato } from "@/features/statement/api";

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
