import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AccountCard from "@/features/account/AccountCard";
import { useContas } from "@/features/account/queries";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";

export default function AccountsPage() {
  const { t } = useTranslation(["account", "common", "errors"]);
  const { data: contas, isPending, isError, error } = useContas();

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
      {contas.length === 0 ? (
        <p className="mt-4 text-muted-foreground">{t("account:empty")}</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {contas.map((conta) => (
            <AccountCard key={conta.id} conta={conta} />
          ))}
        </div>
      )}
    </section>
  );
}
