import type { Instituicao } from "@/features/account/types";
import InstitutionLogo from "@/features/institution/InstitutionLogo";

/**
 * Escolha de banco por LOGO, em grupo de radio.
 *
 * Extraido de AccountLookup quando o dialogo de abrir conta precisou da
 * mesma coisa. Nao e reuso por economia: eram os dois unicos lugares onde
 * se escolhe instituicao, e mante-los diferentes fazia a mesma pergunta ter
 * duas respostas visuais no mesmo app — um <select> de texto num, uma faixa
 * de logos no outro.
 *
 * radiogroup, e nao botoes soltos: um <select> ja dava navegacao por setas e
 * anunciava "selecionado" a leitor de tela, e trocar por cartoes clicaveis
 * sem isso seria regressao vestida de melhoria.
 */
export default function InstitutionPicker({
  instituicoes,
  escolhida,
  aoEscolher,
  rotuloId,
}: {
  instituicoes: Instituicao[];
  escolhida: string;
  aoEscolher: (id: string) => void;
  /** id do elemento que rotula o grupo, para aria-labelledby. */
  rotuloId: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={rotuloId}
      className="flex flex-wrap gap-2 p-1"
    >
      {instituicoes.map((inst) => {
        const marcada = inst.id === escolhida;
        return (
          <div
            key={inst.id}
            data-testid={`instituicao-${inst.id}`}
            role="radio"
            aria-checked={marcada}
            aria-label={inst.name}
            tabIndex={marcada ? 0 : -1}
            onClick={() => aoEscolher(inst.id)}
            onKeyDown={(evento) => {
              if (evento.key === " " || evento.key === "Enter") {
                evento.preventDefault();
                aoEscolher(inst.id);
              }
            }}
            className={`flex cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm hover:bg-muted ${
              marcada ? "ring-2 ring-[var(--marca-2)]" : ""
            }`}
          >
            <InstitutionLogo instituicao={inst} />
            <span className="truncate">{inst.name}</span>
          </div>
        );
      })}
    </div>
  );
}
