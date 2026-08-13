import { http } from "@/lib/http";
import type { Contato, DadosDaBusca, ResultadoBusca } from "@/features/contact/types";

export async function listarContatos(): Promise<Contato[]> {
  const { data } = await http.get<Contato[]>("/contacts");
  return data;
}

/**
 * Primeiro passo do fluxo de dois passos. Devolve o titular para o usuario
 * CONFERIR antes de qualquer gravacao — e o unico ponto em que ele ve para
 * quem o dinheiro vai antes de mandar.
 */
export async function buscarContaPorDados(dados: DadosDaBusca): Promise<ResultadoBusca> {
  const { data } = await http.post<ResultadoBusca>("/contacts/lookup", dados);
  return data;
}

export async function salvarContato(entrada: {
  account_id: string;
  alias: string;
  is_favorite: boolean;
}): Promise<Contato> {
  const { data } = await http.post<Contato>("/contacts", entrada);
  return data;
}

export async function atualizarContato(
  id: string,
  mudanca: { alias?: string; is_favorite?: boolean },
): Promise<Contato> {
  const { data } = await http.patch<Contato>(`/contacts/${id}`, mudanca);
  return data;
}

export async function removerContato(id: string): Promise<void> {
  await http.delete(`/contacts/${id}`);
}
