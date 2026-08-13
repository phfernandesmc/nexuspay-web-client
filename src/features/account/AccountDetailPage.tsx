import { useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useConta } from "@/features/account/queries";
import RenameAccountDialog from "@/features/account/RenameAccountDialog";
import CloseAccountDialog from "@/features/account/CloseAccountDialog";
import StatementList from "@/features/statement/StatementList";
import PendingBalanceLine from "@/features/statement/PendingBalanceLine";
import { formatarDinheiro, paraCentavos } from "@/lib/money";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";

const ROTULO_TIPO = { CHECKING: "account:checking", SAVINGS: "account:savings" } as const;

export default function AccountDetailPage() {
  const { id = "" } = useParams();
  const { t, i18n } = useTranslation(["account", "common", "errors"]);
  const { data: conta, isPending, isError, error } = useConta(id);
  const [renomeando, setRenomeando] = useState(false);
  const [encerrando, setEncerrando] = useState(false);

  if (isPending) return <p>{t("common:loading")}</p>;

  if (isError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>
          {t(codigoTraduzivel(extrairErro(error).code), { ns: "errors" })}
        </AlertDescription>
      </Alert>
    );
  }

  const locale = i18n.resolvedLanguage ?? "pt-BR";

  return (
    <section>
      <h1 className="text-2xl font-semibold">{conta.alias ?? t("account:noAlias")}</h1>
      <p className="text-sm text-muted-foreground">
        {conta.institution.name} · {t("account:branch")} {conta.branch} ·{" "}
        {t("account:number")} {conta.number} · {t(ROTULO_TIPO[conta.type])}
        {conta.status === "CLOSED" ? ` · ${t("account:closed")}` : ""}
      </p>

      <p className="mt-4 text-3xl font-semibold">
        {formatarDinheiro(paraCentavos(conta.balance), locale)}
      </p>
      <PendingBalanceLine contaId={conta.id} saldo={conta.balance} />

      <div className="mt-4 flex gap-2">
        <Button variant="outline" onClick={() => setRenomeando(true)}>
          {t("account:rename")}
        </Button>
        <Button variant="outline" onClick={() => setEncerrando(true)}>
          {t("account:close")}
        </Button>
      </div>

      {/* Montagem condicional, nao so `aberto`: o dialogo guarda estado
          proprio (alias digitado, mensagem de erro). Mante-lo sempre montado
          deixaria esse estado sobreviver ao cancelamento — reabrir mostraria
          um erro que ja nao existe mais, ou um texto que o usuario nunca
          confirmou. Desmontar ao fechar faz o estado morrer com o dialogo. */}
      {renomeando && (
        <RenameAccountDialog conta={conta} aberto={renomeando} onFechar={() => setRenomeando(false)} />
      )}
      {encerrando && (
        <CloseAccountDialog contaId={conta.id} aberto={encerrando} onFechar={() => setEncerrando(false)} />
      )}

      <StatementList contaId={conta.id} />
    </section>
  );
}
