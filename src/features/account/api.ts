import { http } from "@/lib/http";
import type { Conta, Instituicao, TipoConta } from "@/features/account/types";

export async function listarContas(): Promise<Conta[]> {
  const { data } = await http.get<Conta[]>("/accounts");
  return data;
}

export async function buscarConta(id: string): Promise<Conta> {
  const { data } = await http.get<Conta>(`/accounts/${id}`);
  return data;
}

export async function listarInstituicoes(): Promise<Instituicao[]> {
  const { data } = await http.get<Instituicao[]>("/institutions");
  return data;
}

export async function abrirConta(entrada: {
  institution_id: string;
  type: TipoConta;
  alias: string | null;
}): Promise<Conta> {
  const { data } = await http.post<Conta>("/accounts", entrada);
  return data;
}

export async function renomearConta(id: string, alias: string | null): Promise<Conta> {
  const { data } = await http.patch<Conta>(`/accounts/${id}`, { alias });
  return data;
}

export async function encerrarConta(id: string): Promise<void> {
  await http.delete(`/accounts/${id}`);
}
