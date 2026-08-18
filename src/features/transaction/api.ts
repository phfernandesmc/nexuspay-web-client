import { http } from "@/lib/http";
import type { RespostaTransacao, Transacao } from "@/features/transaction/types";

/**
 * 202 = criada agora. 200 = a Idempotency-Key ja tinha sido usada e o
 * gateway esta reapresentando a transacao que ja existe. Descartar essa
 * diferenca faria a tela dizer "enviada" para um reenvio que nao enviou nada.
 */
function comOrigem(status: number, transacao: Transacao): RespostaTransacao {
  return { transacao, criadaAgora: status === 202 };
}

export async function transferir(
  entrada: { source_account_id: string; destination_account_id: string; amount: string },
  chave: string,
): Promise<RespostaTransacao> {
  const resposta = await http.post<Transacao>("/transactions/transfer", entrada, {
    headers: { "Idempotency-Key": chave },
  });
  return comOrigem(resposta.status, resposta.data);
}

export async function depositar(
  entrada: { account_id: string; amount: string },
  chave: string,
): Promise<RespostaTransacao> {
  const resposta = await http.post<Transacao>("/transactions/deposit", entrada, {
    headers: { "Idempotency-Key": chave },
  });
  return comOrigem(resposta.status, resposta.data);
}

export async function buscarTransacao(id: string): Promise<Transacao> {
  const { data } = await http.get<Transacao>(`/transactions/${id}`);
  return data;
}
