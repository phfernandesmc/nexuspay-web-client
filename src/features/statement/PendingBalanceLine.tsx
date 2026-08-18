import { useTranslation } from "react-i18next";
import { formatarDinheiro, paraCentavos } from "@/lib/money";

/**
 * O processando e o disponivel, a partir dos dois numeros que ja vieram com
 * a conta.
 *
 * Ate a Fatia 3c isto fazia consulta propria ao extrato com limit=100 e
 * derivava a soma no cliente — com o furo declarado na secao 6 do spec da
 * 3b: uma pendencia antiga empurrada para alem das 100 primeiras fazia o
 * disponivel exibido ficar MAIOR que o real. O gateway passou a expor a
 * soma, entao nao ha mais consulta, nem carregamento, nem erro proprio.
 */
export default function PendingBalanceLine({
  saldo,
  pendente,
}: {
  saldo: string | number;
  pendente: string | number;
}) {
  const { t, i18n } = useTranslation(["statement"]);
  const locale = i18n.resolvedLanguage ?? "pt-BR";
  const centavos = paraCentavos(pendente);

  if (centavos === 0) return null;

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
