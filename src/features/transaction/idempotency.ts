import { useCallback, useRef, useState } from "react";

/**
 * Serializa o payload de forma estavel: as chaves saem em ordem alfabetica,
 * entao { a, b } e { b, a } produzem a mesma string. Sem isso, remontar o
 * objeto numa ordem diferente trocaria a chave de idempotencia sem o
 * usuario ter mudado campo nenhum.
 */
function assinatura(payload: unknown): string {
  return JSON.stringify(payload, (_chave, valor: unknown) => {
    if (valor && typeof valor === "object" && !Array.isArray(valor)) {
      const entradas = Object.entries(valor as Record<string, unknown>);
      entradas.sort(([a], [b]) => a.localeCompare(b));
      return Object.fromEntries(entradas);
    }
    return valor;
  });
}

/**
 * A Idempotency-Key da intencao atual.
 *
 * Presa ao payload: enquanto ele nao mudar, a mesma chave volta. Reenviar
 * depois de uma falha de rede manda a mesma chave, e o gateway devolve 200
 * com a transacao que ja existe em vez de criar outra. Mudar qualquer campo
 * torna a intencao outra, e a chave e descartada.
 *
 * NAO e persistida: recarregar a pagina a perde, e isso e aceito porque o
 * recibo em /transacoes/:id responde "passou?" sem depender dela.
 */
export function useChaveDeIntencao(payload: unknown): {
  chave: string;
  limparChave: () => void;
} {
  const atual = assinatura(payload);
  const assinaturaRef = useRef(atual);
  const [chave, setChave] = useState(() => crypto.randomUUID());

  if (assinaturaRef.current !== atual) {
    assinaturaRef.current = atual;
    // Gerar durante o render e seguro aqui: o valor deriva do payload, e o
    // React re-renderiza com o estado novo sem efeito colateral externo.
    setChave(crypto.randomUUID());
  }

  const limparChave = useCallback(() => {
    setChave(crypto.randomUUID());
  }, []);

  return { chave, limparChave };
}
