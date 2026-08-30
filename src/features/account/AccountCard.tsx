import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { Conta } from "@/features/account/types";
import InstitutionLogo from "@/features/institution/InstitutionLogo";
import { formatarDinheiro, paraCentavos } from "@/lib/money";

const ROTULO_TIPO = { CHECKING: "account:checking", SAVINGS: "account:savings" } as const;

export default function AccountCard({ conta }: { conta: Conta }) {
  const { t, i18n } = useTranslation(["account", "common"]);
  const disponivel = paraCentavos(conta.balance) - paraCentavos(conta.pending_outgoing);

  return (
    <Link
      to={`/contas/${conta.id}`}
      data-testid={`conta-${conta.id}`}
      className="flex items-center gap-4 rounded-lg border border-l-4 p-4 hover:bg-muted"
      // A cor vem da instituicao: e o que o color_hex existe para fazer.
      style={{ borderLeftColor: conta.institution.color_hex }}
    >
      <InstitutionLogo instituicao={conta.institution} />

      {/* min-w-0 permite o truncate: um filho de flex tem min-width auto por
          padrao e se recusa a encolher abaixo do proprio conteudo, entao sem
          isto um apelido longo empurra o saldo para fora do card. */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{conta.alias ?? t("account:noAlias")}</p>
        <p className="truncate text-sm text-muted-foreground">
          {conta.institution.name} · {t("account:branch")} {conta.branch} ·{" "}
          {t("account:number")} {conta.number} · {t(ROTULO_TIPO[conta.type])}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-xl font-semibold">
          {formatarDinheiro(paraCentavos(conta.balance), i18n.resolvedLanguage ?? "pt-BR")}
        </p>
        {paraCentavos(conta.pending_outgoing) > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("account:available")}:{" "}
            {formatarDinheiro(disponivel, i18n.resolvedLanguage ?? "pt-BR")}
          </p>
        )}
      </div>
    </Link>
  );
}
