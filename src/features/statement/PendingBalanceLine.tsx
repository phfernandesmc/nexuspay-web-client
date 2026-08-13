import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatarDinheiro, paraCentavos } from "@/lib/money";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";
import { usePendentesDeSaida } from "@/features/statement/queries";

export default function PendingBalanceLine({
  contaId,
  saldo,
}: {
  contaId: string;
  saldo: string | number;
}) {
  const { t, i18n } = useTranslation(["statement", "errors"]);
  const { centavos, isPending, isError, error } = usePendentesDeSaida(contaId);
  const locale = i18n.resolvedLanguage ?? "pt-BR";

  if (isPending) return null;

  // A falha de rede nao pode se disfarcar de "sem pendencias": as duas
  // renderizavam o mesmo marcador vazio, e a tela afirmava silenciosamente
  // que o saldo cheio estava disponivel quando ninguem sabia. Mesmo padrao
  // de AccountsPage.tsx, AccountDetailPage.tsx e StatementList.tsx.
  if (isError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>
          {t(codigoTraduzivel(extrairErro(error).code), { ns: "errors" })}
        </AlertDescription>
      </Alert>
    );
  }

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
