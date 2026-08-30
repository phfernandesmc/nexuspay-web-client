import { useTranslation } from "react-i18next";
import type { Conta } from "@/features/account/types";
import InstitutionLogo from "@/features/institution/InstitutionLogo";
import { corLegivel } from "@/lib/cor";
import { formatarDinheiro, paraCentavos } from "@/lib/money";

const ROTULO_TIPO = { CHECKING: "account:checking", SAVINGS: "account:savings" } as const;

/**
 * Escolha da conta de origem em faixa horizontal.
 *
 * radiogroup, e nao uma pilha de <button>: o <select> que existia aqui ja
 * dava navegacao por setas e anunciava "selecionado" a leitores de tela, e
 * trocar por cartoes clicaveis perderia as duas coisas — uma regressao
 * vestida de melhoria. As setas sao tratadas abaixo, e tabIndex e rotativo
 * (so o item marcado entra na ordem de tabulacao), que e o padrao esperado
 * de um grupo de radio.
 */
export default function SourceAccountPicker({
  contas,
  escolhida,
  aoEscolher,
}: {
  contas: Conta[];
  escolhida: string;
  aoEscolher: (id: string) => void;
}) {
  const { t, i18n } = useTranslation(["transaction", "account"]);
  const locale = i18n.resolvedLanguage ?? "pt-BR";

  function aoTeclar(evento: React.KeyboardEvent, indice: number) {
    const passo = evento.key === "ArrowRight" ? 1 : evento.key === "ArrowLeft" ? -1 : 0;
    if (passo === 0) return;
    evento.preventDefault();
    const proxima = contas[(indice + passo + contas.length) % contas.length];
    aoEscolher(proxima.id);
    document.getElementById(`origem-${proxima.id}`)?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("transaction:source")}
      className="flex gap-3 overflow-x-auto pb-2"
    >
      {contas.map((conta, indice) => {
        const marcada = conta.id === escolhida;
        const disponivel = paraCentavos(conta.balance) - paraCentavos(conta.pending_outgoing);
        return (
          <div
            key={conta.id}
            id={`origem-${conta.id}`}
            data-testid={`origem-${conta.id}`}
            role="radio"
            aria-checked={marcada}
            tabIndex={marcada || (escolhida === "" && indice === 0) ? 0 : -1}
            onClick={() => aoEscolher(conta.id)}
            onKeyDown={(evento) => {
              if (evento.key === " " || evento.key === "Enter") {
                evento.preventDefault();
                aoEscolher(conta.id);
              }
              aoTeclar(evento, indice);
            }}
            className={`w-56 shrink-0 cursor-pointer rounded-xl p-4 text-white outline-none ${
              marcada ? "ring-2 ring-[var(--marca-2)] ring-offset-2" : ""
            }`}
            style={{ backgroundColor: corLegivel(conta.institution.color_hex) }}
          >
            <div className="flex items-center gap-2">
              <InstitutionLogo instituicao={conta.institution} />
              <p className="truncate text-sm font-medium">{conta.institution.name}</p>
            </div>
            <p className="mt-3 truncate text-xs text-white/80">
              {t(ROTULO_TIPO[conta.type], { ns: "account" })}
            </p>
            <p className="text-lg font-bold">{formatarDinheiro(disponivel, locale)}</p>
          </div>
        );
      })}
    </div>
  );
}
