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

/**
 * Baixa o extrato do periodo em PDF.
 *
 * Passa pelo cliente HTTP, e nao por um <a href> nativo: o token de acesso
 * vive so em memoria (nunca em cookie), entao o navegador nao mandaria o
 * cabecalho Authorization e o gateway responderia 401. O arquivo vem como
 * blob e o download e disparado por um link temporario.
 */
export async function baixarExtratoDoPeriodo(filtro: FiltroDePeriodo): Promise<void> {
  const { data } = await http.get<Blob>("/transactions/statement.pdf", {
    responseType: "blob",
    params: {
      date_from: filtro.date_from,
      date_to: filtro.date_to,
      ...(filtro.account_id === undefined ? {} : { account_id: filtro.account_id }),
    },
  });

  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = `extrato-${filtro.date_from}-a-${filtro.date_to}.pdf`;
  link.click();
  // Sem revoke, o blob fica na memoria da aba ate ela fechar — e quem gera
  // varios extratos seguidos acumula todos.
  URL.revokeObjectURL(url);
}
