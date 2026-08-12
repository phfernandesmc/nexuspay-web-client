import axios from "axios";
import { http, URL_BASE } from "@/lib/http";
import { comTrava } from "@/lib/locks";
import type { Usuario } from "@/features/auth/session.store";

type RespostaToken = { access_token: string; token_type: string; expires_in: number };

export async function registrar(dados: {
  full_name: string;
  email: string;
  document: string;
  password: string;
}): Promise<{ access_token: string; user: Usuario }> {
  const { data } = await http.post<RespostaToken & { user: Usuario }>("/auth/register", dados);
  return { access_token: data.access_token, user: data.user };
}

export async function entrar(dados: { email: string; password: string }): Promise<{ access_token: string }> {
  const { data } = await http.post<RespostaToken>("/auth/login", dados);
  return { access_token: data.access_token };
}

export async function sair(): Promise<void> {
  await http.post("/auth/logout");
}

export async function buscarUsuario(): Promise<Usuario> {
  const { data } = await http.get<Usuario>("/auth/me");
  return data;
}

/**
 * Renovacao do boot, com instancia crua.
 *
 * Nao usa `http` porque o 401 esperado aqui — cookie ausente ou expirado —
 * nao deve acionar o interceptor de renovacao: nao ha sessao a renovar, e o
 * caminho correto e simplesmente concluir que o usuario e anonimo.
 *
 * Passa pela MESMA trava entre abas que o refresh do interceptor. Esta e a
 * entrada mais perigosa das duas: toda carga de pagina dispara um refresh
 * silencioso, entao duas abas abertas ao mesmo tempo, restaurar a sessao do
 * navegador ou duplicar a aba sao dois refresh concorrentes com o mesmo
 * cookie — e o gateway responde a isso revogando todas as sessoes.
 */
export async function renovarNoBoot(): Promise<string> {
  return comTrava(async () => {
    const { data } = await axios.post<RespostaToken>(`${URL_BASE}/auth/refresh`, null, {
      withCredentials: true,
    });
    return data.access_token;
  });
}
