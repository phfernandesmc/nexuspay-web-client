import { useEffect, useRef, type ReactNode } from "react";

/**
 * Moldura dos dialogos, na mesma linguagem das telas de login e cadastro:
 * faixa de gradiente no topo e cartao centrado sobre uma sobreposicao.
 *
 * Escape fecha. Um modal que so fecha pelo botao Cancelar prende quem
 * navega por teclado, porque o foco pode nem alcancar o botao.
 */
export default function Modal({
  titulo,
  aoFechar,
  children,
}: {
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
}) {
  const refCartao = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    // Leva o foco para dentro ao abrir: sem isso ele continua no botao que
    // abriu o modal, atras da sobreposicao, e a primeira tecla age na
    // pagina de baixo.
    refCartao.current?.focus();
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Clicar fora fecha. aria-hidden porque a sobreposicao e visual: quem
          usa leitor de tela sai pelo Escape ou pelo botao. */}
      <div aria-hidden="true" className="absolute inset-0 bg-black/50" onClick={aoFechar} />

      <div
        ref={refCartao}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border bg-background shadow-xl outline-none"
      >
        <div className="h-1.5 bg-gradient-to-r from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)]" />
        <div className="max-h-[80vh] overflow-y-auto p-6">
          <h2 className="mb-4 text-lg font-semibold">{titulo}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}
