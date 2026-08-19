import { http } from "@/lib/http";
import type { PaginaExtrato } from "@/features/statement/types";

/**
 * Uma pagina do extrato.
 *
 * O gateway rejeita limit fora de 1..100 com 422 em vez de clampar, entao
 * o valor nunca e passado adiante sem checagem.
 */
export async function buscarExtrato(
  contaId: string,
  cursor: string | null,
  limit?: number,
): Promise<PaginaExtrato> {
  const { data } = await http.get<PaginaExtrato>(`/accounts/${contaId}/statement`, {
    params: {
      ...(cursor === null ? {} : { cursor }),
      ...(limit === undefined ? {} : { limit }),
    },
  });
  return data;
}
