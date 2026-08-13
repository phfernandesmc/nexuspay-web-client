import { useTranslation } from "react-i18next";
import { formatarDinheiro, paraCentavos } from "@/lib/money";
import { usePendentesDeSaida } from "@/features/statement/queries";

export default function PendingBalanceLine({
  contaId,
  saldo,
}: {
  contaId: string;
  saldo: string | number;
}) {
  const { t, i18n } = useTranslation("statement");
  const { centavos, isPending } = usePendentesDeSaida(contaId);
  const locale = i18n.resolvedLanguage ?? "pt-BR";

  if (isPending) return null;
  if (centavos === 0) return <span data-testid="sem-pendencias" hidden />;

  const disponivel = paraCentavos(saldo) - centavos;

  return (
    <dl className="mt-2 text-sm">
      <div className="flex justify-between">
        <dt>{t("statement:processing")}</dt>
        <dd>-{formatarDinheiro(centavos, locale)}</dd>
      </div>
      <div className="flex justify-between font-medium">
        <dt>{t("statement:available")}</dt>
        <dd>{formatarDinheiro(disponivel, locale)}</dd>
      </div>
    </dl>
  );
}
