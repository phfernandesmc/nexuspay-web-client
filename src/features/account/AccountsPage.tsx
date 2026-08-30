import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus } from "lucide-react";
import AccountCard from "@/features/account/AccountCard";
import OpenAccountDialog from "@/features/account/OpenAccountDialog";
import { useContas } from "@/features/account/queries";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";

export default function AccountsPage() {
  const { t } = useTranslation(["account", "common", "errors"]);
  const { data: contas, isPending, isError, error } = useContas();
  const [abrindo, setAbrindo] = useState(false);

  if (isPending) return <p>{t("common:loading")}</p>;

  if (isError) {
    const { code } = extrairErro(error);
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>
          {/* codigoTraduzivel, e nao o codigo cru: o i18next devolve a
              propria chave quando ela nao existe, entao um HTTP_502 do
              gateway chegaria cru na tela do usuario. Ver LoginPage.tsx. */}
          {t(codigoTraduzivel(code), { ns: "errors" })}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold">{t("account:title")}</h1>

      {contas.length === 0 && (
        <p className="mt-4 text-muted-foreground">{t("account:empty")}</p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {contas.map((conta) => (
          <AccountCard key={conta.id} conta={conta} />
        ))}

        {/* O convite e um <button> com rotulo visivel, e nao um card so com
            o icone de mais: um "+" sozinho nao anuncia nada a leitor de tela
            e obrigaria um aria-label que ninguem ve para conferir. Ele e
            tambem o estado vazio — quem chega sem contas precisa de um
            caminho, nao so de uma frase. */}
        <button
          type="button"
          onClick={() => setAbrindo(true)}
          className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-muted-foreground transition hover:border-[var(--marca-2)] hover:text-[var(--marca-2)]"
        >
          <Plus className="size-8" />
          <span className="font-medium">{t("account:open")}</span>
        </button>
      </div>

      {/* Montagem condicional, nao so `aberto`: sem isso o dialogo fica
          sempre montado e o estado (instituicao, apelido, erro) sobrevive ao
          cancelamento — reabrir mostraria dados de uma tentativa anterior.
          Desmontar ao fechar faz o estado morrer com o dialogo. */}
      {abrindo && <OpenAccountDialog aberto={abrindo} onFechar={() => setAbrindo(false)} />}
    </section>
  );
}
