import { http } from "@/lib/http";
import type { PaginaExtrato } from "@/features/statement/types";

/** Uma pagina do extrato. */
export async function buscarExtrato(
  contaId: string,
  cursor: string | null,
): Promise<PaginaExtrato> {
  const { data } = await http.get<PaginaExtrato>(`/accounts/${contaId}/statement`, {
    params: {
      ...(cursor === null ? {} : { cursor }),
    },
  });
  return data;
}
