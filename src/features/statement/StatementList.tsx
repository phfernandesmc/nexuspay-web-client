import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import StatementRow from "@/features/statement/StatementRow";
import { useExtrato } from "@/features/statement/queries";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";

export default function StatementList({ contaId }: { contaId: string }) {
  const { t } = useTranslation(["statement", "common", "errors"]);
  const {
    data,
    isPending,
    isError,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useExtrato(contaId);

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

  const itens = data.pages.flatMap((pagina) => pagina.items);

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{t("statement:title")}</h2>

      {itens.length === 0 ? (
        <p className="mt-4 text-muted-foreground">{t("statement:empty")}</p>
      ) : (
        <ul className="mt-4">
          {itens.map((item) => (
            <StatementRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      {/* O botao so existe quando ha proxima pagina: um botao permanente que
          nao faz nada e pior do que nenhum botao. */}
      {hasNextPage && (
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {t("statement:loadMore")}
        </Button>
      )}
    </section>
  );
}
