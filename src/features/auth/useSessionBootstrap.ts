import { useEffect, useRef } from "react";
import { useSession } from "@/features/auth/session.store";
import { buscarUsuario, renovarNoBoot } from "@/features/auth/api";

/**
 * Tenta restaurar a sessao a partir do cookie httpOnly, uma unica vez.
 *
 * O guarda de execucao unica importa: em StrictMode o React monta, desmonta
 * e remonta em desenvolvimento, e sem ele o boot dispararia DOIS
 * /auth/refresh concorrentes — exatamente o cenario que revoga todas as
 * sessoes do usuario.
 */
export function useSessionBootstrap(): void {
  const jaRodou = useRef(false);

  useEffect(() => {
    if (jaRodou.current) return;
    jaRodou.current = true;

    void (async () => {
      try {
        const token = await renovarNoBoot();
        useSession.getState().definirToken(token);
        const usuario = await buscarUsuario();
        useSession.getState().autenticar(token, usuario);
      } catch {
        useSession.getState().marcarAnonimo();
      }
    })();
  }, []);
}
