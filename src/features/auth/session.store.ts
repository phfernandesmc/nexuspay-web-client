import { create } from "zustand";

export type Usuario = {
  id: string;
  full_name: string;
  email: string;
  document: string;
  created_at: string;
};

export type StatusSessao = "booting" | "authenticated" | "anonymous";

type EstadoSessao = {
  accessToken: string | null;
  user: Usuario | null;
  status: StatusSessao;
  /**
   * Codigo de erro que explica por que a sessao acabou, quando ha um.
   *
   * E o unico canal entre quem encerra a sessao (o interceptor de resposta,
   * fora de qualquer componente) e a tela de login, que o router monta do
   * zero — com o estado de erro dela nascendo `null`. Sem ele,
   * REFRESH_TOKEN_REUSED joga o usuario no login sem nenhuma explicacao, o
   * que e indistinguivel de um bug do app justamente no evento que pode ser
   * roubo de token.
   */
  motivoEncerramento: string | null;
  autenticar: (token: string, user: Usuario) => void;
  definirToken: (token: string) => void;
  encerrar: (motivo?: string) => void;
  marcarAnonimo: () => void;
  limparMotivoEncerramento: () => void;
};

/**
 * O access token vive SO aqui, em memoria.
 *
 * Recarregar a pagina o perde, e tudo bem: o cookie httpOnly de refresh
 * sobrevive e o bootstrap restaura a sessao. Guardar em localStorage o
 * exporia a qualquer XSS sem ganhar nada que o cookie ja nao de.
 *
 * O status comeca em "booting" de proposito. Ele so vira "anonymous" quando
 * o refresh silencioso responder — antes disso a interface nao sabe, e
 * mostrar o login nesse intervalo o faz piscar para quem esta autenticado.
 */
export const useSession = create<EstadoSessao>((set) => ({
  accessToken: null,
  user: null,
  status: "booting",
  motivoEncerramento: null,
  autenticar: (accessToken, user) =>
    set({ accessToken, user, status: "authenticated", motivoEncerramento: null }),
  definirToken: (accessToken) => set({ accessToken }),
  // Sair pelo botao nao tem motivo: o usuario sabe por que esta no login.
  encerrar: (motivo) =>
    set({ accessToken: null, user: null, status: "anonymous", motivoEncerramento: motivo ?? null }),
  marcarAnonimo: () =>
    set({ accessToken: null, user: null, status: "anonymous", motivoEncerramento: null }),
  limparMotivoEncerramento: () => set({ motivoEncerramento: null }),
}));

/** Leitura fora de componente — o interceptor do Axios nao e um hook. */
export function lerToken(): string | null {
  return useSession.getState().accessToken;
}
