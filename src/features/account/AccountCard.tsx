import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { Conta } from "@/features/account/types";
import { formatarDinheiro, paraCentavos } from "@/lib/money";

const ROTULO_TIPO = { CHECKING: "account:checking", SAVINGS: "account:savings" } as const;

export default function AccountCard({ conta }: { conta: Conta }) {
  const { t, i18n } = useTranslation(["account", "common"]);

  return (
    <Link
      to={`/contas/${conta.id}`}
      data-testid={`conta-${conta.id}`}
      className="block rounded-lg border-l-4 p-4 hover:bg-muted"
      // A cor vem da instituicao: e o que o color_hex existe para fazer.
      style={{ borderLeftColor: conta.institution.color_hex }}
    >
      <p className="font-medium">{conta.alias ?? t("account:noAlias")}</p>
      <p className="text-sm text-muted-foreground">
        {conta.institution.name} · {t("account:branch")} {conta.branch} ·{" "}
        {t("account:number")} {conta.number} · {t(ROTULO_TIPO[conta.type])}
      </p>
      <p className="mt-2 text-xl font-semibold">
        {formatarDinheiro(paraCentavos(conta.balance), i18n.resolvedLanguage ?? "pt-BR")}
      </p>
      {paraCentavos(conta.pending_outgoing) > 0 && (
        <p className="text-sm text-muted-foreground">
          {t("account:available")}:{" "}
          {formatarDinheiro(
            paraCentavos(conta.balance) - paraCentavos(conta.pending_outgoing),
            i18n.resolvedLanguage ?? "pt-BR",
          )}
        </p>
      )}
    </Link>
  );
}
