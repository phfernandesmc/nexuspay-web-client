import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { lerToken, useSession } from "@/features/auth/session.store";

export const URL_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1";

export const http = axios.create({
  baseURL: URL_BASE,
  // Obrigatorio: sem isso o cookie httpOnly de refresh nao viaja e o
  // /auth/refresh responde 401 para sempre.
  withCredentials: true,
});

type Requisicao = InternalAxiosRequestConfig & { _repetida?: boolean };

http.interceptors.request.use((config) => {
  const token = lerToken();
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  return config;
});

/**
 * A renovacao em voo, compartilhada por todas as requisicoes que falharem
 * enquanto ela nao resolver.
 *
 * Esta variavel e o coracao da fatia. O gateway rotaciona o refresh token a
 * cada uso e detecta reuso revogando TODAS as sessoes do usuario. Sem a
 * fila, duas requisicoes que tomam 401 juntas disparam dois /auth/refresh; o
 * segundo apresenta um token ja rotacionado, e o usuario e deslogado de
 * tudo. Duas requisicoes em paralelo e o caso normal, nao a excecao.
 */
let renovacaoEmVoo: Promise<string> | null = null;

async function pedirTokenNovo(): Promise<string> {
  // Instancia CRUA de proposito: usar `http` aqui faria o proprio
  // /auth/refresh passar pelo interceptor de resposta e tentar renovar a si
  // mesmo, em recursao.
  const resposta = await axios.post<{ access_token: string }>(
    `${URL_BASE}/auth/refresh`,
    null,
    { withCredentials: true },
  );
  return resposta.data.access_token;
}

function renovar(): Promise<string> {
  renovacaoEmVoo ??= pedirTokenNovo().finally(() => {
    renovacaoEmVoo = null;
  });
  return renovacaoEmVoo;
}

function codigoDe(erro: AxiosError): string {
  const corpo = erro.response?.data as { error?: { code?: string } } | undefined;
  return corpo?.error?.code ?? "";
}

http.interceptors.response.use(
  (resposta) => resposta,
  async (erro: AxiosError) => {
    const requisicao = erro.config as Requisicao | undefined;
    const codigo = codigoDe(erro);

    // Sessoes revogadas por seguranca: nao adianta renovar, e insistir
    // apresentaria de novo um token ja marcado como comprometido.
    if (codigo === "REFRESH_TOKEN_REUSED") {
      useSession.getState().encerrar();
      return Promise.reject(erro);
    }

    const renovavel =
      erro.response?.status === 401 &&
      codigo === "TOKEN_EXPIRED" &&
      requisicao !== undefined &&
      requisicao._repetida !== true &&
      // O proprio refresh nunca passa por aqui.
      !requisicao.url?.includes("/auth/refresh");

    if (!renovavel) return Promise.reject(erro);

    try {
      const token = await renovar();
      useSession.getState().definirToken(token);
      requisicao._repetida = true;
      return await http.request(requisicao);
    } catch {
      useSession.getState().encerrar();
      return Promise.reject(erro);
    }
  },
);
