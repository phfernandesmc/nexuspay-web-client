import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { CHAVES } from "@/features/account/queries";
import { buscarExtrato, LIMITE_MAXIMO } from "@/features/statement/api";
import { paraCentavos, somarCentavos } from "@/lib/money";

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
 * Soma das saidas PENDING, para derivar o saldo disponivel.
 *
 * O gateway calcula "disponivel = saldo - saidas pendentes" apenas dentro da
 * validacao de transferencia, e so o revela no details do erro
 * INSUFFICIENT_FUNDS. O AccountOut traz somente balance.
 *
 * FURO CONHECIDO E ACEITO (secao 6 do spec): PENDING nao e necessariamente
 * recente. Uma transacao presa porque o worker caiu fica pendente por horas,
 * e transacoes mais novas podem empurra-la para alem das 100 primeiras — ai
 * o disponivel exibido fica MAIOR que o real, exatamente quando o numero
 * mais importa. O extrato nao aceita filtro por status, entao nao ha
 * consulta barata que resolva. A correcao definitiva e expor o campo no
 * gateway; esta registrada nos follow-ups.
 */
export function usePendentesDeSaida(contaId: string) {
  const consulta = useQuery({
    queryKey: CHAVES.extratoPendentes(contaId),
    queryFn: () => buscarExtrato(contaId, null, LIMITE_MAXIMO),
    // Sem guarda, quem ainda nao escolheu conta (contaId === "") dispara
    // GET /accounts//statement?limit=100 a cada render — chamada malformada
    // que nunca teria uma conta valida do outro lado.
    enabled: contaId !== "",
  });

  const centavos = somarCentavos(
    (consulta.data?.items ?? [])
      // Entrada pendente nao reduz o disponivel: o dinheiro esta chegando.
      // Saida concluida ja saiu do saldo. So a saida pendente esta reservada.
      .filter((i) => i.direction === "OUT" && i.status === "PENDING")
      .map((i) => paraCentavos(i.amount)),
  );

  return {
    centavos,
    isPending: consulta.isPending,
    isError: consulta.isError,
    error: consulta.error,
  };
}
