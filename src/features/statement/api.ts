import { http } from "@/lib/http";
import type {
  FiltroDePeriodo,
  PaginaDoPeriodo,
  PaginaExtrato,
} from "@/features/statement/types";

/** Uma pagina do extrato. */
export async function buscarExtrato(
  contaId: string,
  cursor: string | null,
  limite?: number,
): Promise<PaginaExtrato> {
  const { data } = await http.get<PaginaExtrato>(`/accounts/${contaId}/statement`, {
    params: {
      ...(cursor === null ? {} : { cursor }),
      ...(limite === undefined ? {} : { limit: limite }),
    },
  });
  return data;
}

/**
 * Extrato de um periodo, numa conta ou em todas.
 *
 * account_id ausente e OMITIDO da query, nao enviado vazio: o gateway
 * distingue "todas as contas" pela ausencia do parametro, e uma string
 * vazia viraria um UUID invalido.
 */
export async function buscarExtratoDoPeriodo(
  filtro: FiltroDePeriodo,
  cursor: string | null,
): Promise<PaginaDoPeriodo> {
  const { data } = await http.get<PaginaDoPeriodo>("/transactions/statement", {
    params: {
      date_from: filtro.date_from,
      date_to: filtro.date_to,
      ...(filtro.account_id === undefined ? {} : { account_id: filtro.account_id }),
      ...(cursor === null ? {} : { cursor }),
    },
  });
  return data;
}
