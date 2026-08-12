import { useEffect, useRef } from "react";
import { AxiosError } from "axios";
import { useSession } from "@/features/auth/session.store";
import { buscarUsuario, renovarNoBoot } from "@/features/auth/api";
import { extrairErro } from "@/lib/errors";

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
      } catch (erro) {
        // 401 e o caminho esperado e silencioso: cookie ausente ou expirado,
        // ou seja, nao ha sessao para restaurar. Qualquer outra coisa — 500
        // do gateway, rede fora, ou /auth/me falhando DEPOIS de um refresh
        // bem-sucedido — e uma sessao valida sendo descartada por instabilidade,
        // nao por ausencia de sessao. O resultado para o usuario e o mesmo
        // (marcarAnonimo: sem dados dele a aplicacao nao tem como seguir),
        // mas so o segundo caso merece rastro para quem for investigar.
        const eh401 = erro instanceof AxiosError && erro.response?.status === 401;
        if (!eh401) {
          const { code } = extrairErro(erro);
          console.warn(
            `[nexuspay] boot descartou uma sessao por falha inesperada (codigo: ${code}), nao por ausencia de cookie.`,
          );
        }
        useSession.getState().marcarAnonimo();
      }
    })();
  }, []);
}
