import { useTranslation } from "react-i18next";
import { Link, useLocation, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { motivoTraduzivel, useTransacao } from "@/features/transaction/queries";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";
import { formatarDataHora } from "@/lib/datetime";
import { formatarDinheiro, paraCentavos } from "@/lib/money";

export default function TransactionReceiptPage() {
  const { t, i18n } = useTranslation(["transaction", "errors"]);
  const { id = "" } = useParams<{ id: string }>();
  const local = useLocation();
  const { data: transacao, isPending, isError, error, refetch, isFetching } = useTransacao(id);

  // So existe quando o recibo foi alcancado logo depois do envio. Depois de
  // um recarregamento e undefined, e ai o recibo nao afirma nada sobre
  // novidade — dizer "enviada agora" seria mentira.
  const criadaAgora = (local.state as { criadaAgora?: boolean } | null)?.criadaAgora;

  if (isError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>
          {t(codigoTraduzivel(extrairErro(error).code), { ns: "errors" })}
        </AlertDescription>
      </Alert>
    );
  }

  if (isPending) return null;

  // Em DEPOSIT o dinheiro nao sai de conta nenhuma: source_account_id e
  // sempre null. Um botao que so aparece com source_account_id deixaria
  // todo comprovante de deposito sem caminho de volta. destination_account_id
  // e obrigatorio nos dois tipos, entao ele e o destino certo para DEPOSIT e
  // o fallback seguro se source_account_id vier nulo por algum motivo.
  const contaDoRecibo =
    transacao.type === "DEPOSIT"
      ? transacao.destination_account_id
      : (transacao.source_account_id ?? transacao.destination_account_id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("transaction:receiptTitle")}</h1>

      {criadaAgora === true && <p>{t("transaction:createdNow")}</p>}
      {criadaAgora === false && (
        <Alert role="status">
          <AlertDescription>{t("transaction:replayed")}</AlertDescription>
        </Alert>
      )}

      <p>
        {t("transaction:amount")}:{" "}
        {formatarDinheiro(paraCentavos(transacao.amount), i18n.language)}
      </p>
      <p>
        {t("transaction:type")}: {t(`transaction:${transacao.type}`)}
      </p>
      <p>
        {t("transaction:when")}: {formatarDataHora(transacao.created_at, i18n.language)}
      </p>
      <p>
        {t("transaction:statusLabel")}: {t(`transaction:${transacao.status}`)}
      </p>

      {transacao.status === "PENDING" && <p>{t("transaction:pendingExplained")}</p>}

      {transacao.status === "FAILED" && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {t(motivoTraduzivel(transacao.failure_reason), { ns: "errors" })}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? t("transaction:refreshing") : t("transaction:refresh")}
        </Button>
        <Button variant="outline" render={<Link to={`/contas/${contaDoRecibo}`} />}>
          {t("transaction:backToStatement")}
        </Button>
      </div>
    </div>
  );
}
