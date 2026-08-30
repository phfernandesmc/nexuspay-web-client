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

  /**
   * Conta sem saldo nao pode ser origem.
   *
   * O criterio e o BALANCE, que vem do servidor — nao o disponivel, que e
   * saldo menos pendencias e portanto uma estimativa do cliente. Bloquear
   * pelo disponivel faria o cliente decidir que a transferencia e
   * impossivel, contradizendo a regra do projeto de que quem decide e o
   * gateway ("voce pode enviar mesmo assim"). De uma conta com saldo zero,
   * porem, nao ha decisao do servidor que torne o envio possivel.
   */
  function semSaldo(conta: Conta): boolean {
    return paraCentavos(conta.balance) === 0;
  }

  function aoTeclar(evento: React.KeyboardEvent, indice: number) {
    const passo = evento.key === "ArrowRight" ? 1 : evento.key === "ArrowLeft" ? -1 : 0;
    if (passo === 0) return;
    evento.preventDefault();
    // Pula as bloqueadas: parar o foco numa opcao que nao pode ser escolhida
    // deixa quem navega por teclado presa nela.
    for (let salto = 1; salto <= contas.length; salto += 1) {
      // Modulo que aceita negativo: (x % n + n) % n. A forma direta
      // devolveria indice negativo ao passar da primeira posicao.
      const alvo = ((indice + passo * salto) % contas.length + contas.length) % contas.length;
      const proxima = contas[alvo];
      if (!semSaldo(proxima)) {
        aoEscolher(proxima.id);
        document.getElementById(`origem-${proxima.id}`)?.focus();
        return;
      }
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("transaction:source")}
      // p-1 nao e estetica: o anel de selecao e desenhado FORA do cartao
      // (ring-2 mais ring-offset-2, 4px alem da borda) e overflow-x-auto
      // corta tudo que passa dos limites — sem esse respiro, o anel do
      // primeiro cartao aparece cortado a esquerda e no topo.
      className="flex gap-3 overflow-x-auto p-1 pb-3"
    >
      {contas.map((conta, indice) => {
        const marcada = conta.id === escolhida;
        const bloqueada = semSaldo(conta);
        const disponivel = paraCentavos(conta.balance) - paraCentavos(conta.pending_outgoing);
        return (
          <div
            key={conta.id}
            id={`origem-${conta.id}`}
            data-testid={`origem-${conta.id}`}
            role="radio"
            aria-checked={marcada}
            aria-disabled={bloqueada}
            tabIndex={bloqueada ? -1 : marcada || (escolhida === "" && indice === 0) ? 0 : -1}
            onClick={() => {
              if (!bloqueada) aoEscolher(conta.id);
            }}
            onKeyDown={(evento) => {
              if (bloqueada) return;
              if (evento.key === " " || evento.key === "Enter") {
                evento.preventDefault();
                aoEscolher(conta.id);
              }
              aoTeclar(evento, indice);
            }}
            className={`w-56 shrink-0 rounded-xl p-4 text-white outline-none ${
              bloqueada ? "cursor-not-allowed opacity-60 grayscale" : "cursor-pointer"
            } ${
              // ring-offset-background, e nao o padrao: o offset do Tailwind
              // e branco, o que no modo escuro viraria um halo claro em
              // volta do cartao.
              marcada ? "ring-2 ring-[var(--marca-2)] ring-offset-2 ring-offset-background" : ""
            }`}
            style={{
              backgroundColor: bloqueada
                ? "var(--muted-foreground)"
                : corLegivel(conta.institution.color_hex),
            }}
          >
            <div className="flex items-center gap-2">
              <InstitutionLogo instituicao={conta.institution} />
              <p className="truncate text-sm font-medium">{conta.institution.name}</p>
            </div>
            <p className="mt-3 truncate text-xs text-white/80">
              {t(ROTULO_TIPO[conta.type], { ns: "account" })}
            </p>
            <p className="text-lg font-bold">{formatarDinheiro(disponivel, locale)}</p>
            {/* Diz POR QUE esta apagado: um cartao cinza sem explicacao
                parece defeito da tela, nao uma conta vazia. */}
            {bloqueada && <p className="text-xs">{t("transaction:noBalance")}</p>}
          </div>
        );
      })}
    </div>
  );
}
