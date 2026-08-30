import { useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Archive, Pencil } from "lucide-react";
import BankCard from "@/features/institution/BankCard";
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
    <section className="flex flex-col gap-6">
      {/* O mesmo cartao da lista de contas: a conta se parece consigo mesma
          nas duas telas em que aparece. O apelido continua sendo o h1 da
          pagina — o titulo dentro do cartao e quem da o nome ao documento
          para leitor de tela e para a aba do navegador. */}
      <div className="overflow-hidden rounded-2xl">
        <BankCard
          instituicao={conta.institution}
          titulo={conta.institution.name}
          acoes={
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                aria-label={t("account:rename")}
                className="rounded-full p-2 hover:bg-white/20"
                onClick={() => setRenomeando(true)}
              >
                <Pencil className="size-4" />
              </button>
              {/* Encerrar e irreversivel; vermelho no hover confirma a
                  intencao no momento do clique, sem gritar o tempo todo. */}
              <button
                type="button"
                aria-label={t("account:close")}
                className="rounded-full p-2 hover:bg-red-900/40"
                onClick={() => setEncerrando(true)}
              >
                <Archive className="size-4" />
              </button>
            </div>
          }
        >
          {/* Apelido em elemento proprio: e o que distingue duas contas no
              mesmo banco, e precisa ser localizavel sozinho. */}
          <h1 className="mt-1 font-medium">{conta.alias ?? t("account:noAlias")}</h1>
          <p className="text-sm text-white/80">
            {t(ROTULO_TIPO[conta.type])}
            {conta.status === "CLOSED" ? ` · ${t("account:closed")}` : ""}
          </p>

          <p className="mt-4 text-3xl font-bold">
            {formatarDinheiro(paraCentavos(conta.balance), locale)}
          </p>
          <div className="text-white/90">
            <PendingBalanceLine saldo={conta.balance} pendente={conta.pending_outgoing} />
          </div>

          <div className="mt-4 flex gap-8">
            <div>
              <p className="text-xs text-white/70">{t("account:branch")}</p>
              <p className="font-semibold">{conta.branch}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-white/70">{t("account:number")}</p>
              <p className="truncate font-semibold">{conta.number}</p>
            </div>
          </div>
        </BankCard>
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

      <div className="rounded-2xl border p-6">
        <StatementList contaId={conta.id} />
      </div>
    </section>
  );
}
