import { useTranslation } from "react-i18next";
import type { ItemExtrato } from "@/features/statement/types";
import { formatarDinheiro, paraCentavos } from "@/lib/money";
import { formatarDataHora } from "@/lib/datetime";

const ROTULO_STATUS = {
  PENDING: "statement:pending",
  COMPLETED: "statement:completed",
  FAILED: "statement:failed",
} as const;

export default function StatementRow({ item }: { item: ItemExtrato }) {
  const { t, i18n } = useTranslation("statement");
  const locale = i18n.resolvedLanguage ?? "pt-BR";
  const centavos = paraCentavos(item.amount);
  const sinal = item.direction === "OUT" ? -1 : 1;

  return (
    <li className="flex items-start justify-between border-b py-3">
      <div>
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
        </p>
      </div>
      <p className="font-semibold">{formatarDinheiro(sinal * centavos, locale)}</p>
    </li>
  );
}
