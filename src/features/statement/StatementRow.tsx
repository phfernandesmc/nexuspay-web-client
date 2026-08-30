import { useTranslation } from "react-i18next";
import type { ItemExtrato } from "@/features/statement/types";
import type { Conta } from "@/features/account/types";
import InstitutionLogo from "@/features/institution/InstitutionLogo";
import { formatarDinheiro, paraCentavos } from "@/lib/money";
import { formatarDataHora } from "@/lib/datetime";

const ROTULO_STATUS = {
  PENDING: "statement:pending",
  COMPLETED: "statement:completed",
  FAILED: "statement:failed",
} as const;

export default function StatementRow({
  item,
  conta,
}: {
  item: ItemExtrato;
  /**
   * A conta do usuario a que este item pertence. So a home passa: la varios
   * extratos aparecem misturados. No extrato de uma conta especifica, a
   * conta ja e o titulo da pagina e repeti-la em toda linha seria ruido.
   */
  conta?: Conta;
}) {
  const { t, i18n } = useTranslation("statement");
  const locale = i18n.resolvedLanguage ?? "pt-BR";
  const centavos = paraCentavos(item.amount);
  const entrada = item.direction === "IN";
  const sinal = entrada ? 1 : -1;

  return (
    <li
      data-testid={`extrato-${item.id}`}
      className="flex items-start justify-between border-b py-3"
    >
      <div className="flex min-w-0 gap-3">
        {conta !== undefined && <InstitutionLogo instituicao={conta.institution} />}
        <div className="min-w-0">
        {item.counterparty === null ? (
          <p className="font-medium">{t("statement:deposit")}</p>
        ) : (
          <>
            <p className="font-medium">{item.counterparty.holder_name}</p>
            <p className="text-sm text-muted-foreground">
              {item.counterparty.institution.name} · {item.counterparty.branch} ·{" "}
              {item.counterparty.number}
            </p>
          </>
        )}
        {item.is_between_own_accounts && (
          <p className="text-sm text-muted-foreground">{t("statement:ownTransfer")}</p>
        )}
        <p className="text-sm text-muted-foreground">
          {formatarDataHora(item.created_at, locale)} · {t(ROTULO_STATUS[item.status])}
          {conta !== undefined && ` · ${conta.alias ?? conta.institution.name}`}
        </p>
        </div>
      </div>
      {/* O sinal continua: cor nao pode ser o unico portador do significado,
          e quem nao distingue verde de cinza ainda precisa ler a linha. */}
      <p
        data-testid={`valor-${item.id}`}
        className={`shrink-0 font-semibold ${entrada ? "text-green-600 dark:text-green-400" : ""}`}
      >
        {formatarDinheiro(sinal * centavos, locale)}
      </p>
    </li>
  );
}
