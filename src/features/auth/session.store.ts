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
  autenticar: (token: string, user: Usuario) => void;
  definirToken: (token: string) => void;
  encerrar: () => void;
  marcarAnonimo: () => void;
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
  autenticar: (accessToken, user) => set({ accessToken, user, status: "authenticated" }),
  definirToken: (accessToken) => set({ accessToken }),
  encerrar: () => set({ accessToken: null, user: null, status: "anonymous" }),
  marcarAnonimo: () => set({ accessToken: null, user: null, status: "anonymous" }),
}));

/** Leitura fora de componente — o interceptor do Axios nao e um hook. */
export function lerToken(): string | null {
  return useSession.getState().accessToken;
}
