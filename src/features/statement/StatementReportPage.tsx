import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useContas } from "@/features/account/queries";
import InstitutionLogo from "@/features/institution/InstitutionLogo";
import StatementRow from "@/features/statement/StatementRow";
import { periodoDoMes, periodoDosUltimosDias, type Periodo } from "@/features/statement/periodo";
import { Download } from "lucide-react";
import { baixarExtratoDoPeriodo } from "@/features/statement/api";
import { useExtratoDoPeriodo } from "@/features/statement/queries";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";
import { formatarDinheiro, paraCentavos } from "@/lib/money";

export default function StatementReportPage() {
  const { t, i18n } = useTranslation(["statement", "account", "common", "errors"]);
  const locale = i18n.resolvedLanguage ?? "pt-BR";
  const { data: contas } = useContas();

  // Nasce no mes corrente: o gateway exige date_from e date_to, entao a tela
  // precisa chegar com um periodo. Abrir sem filtro obrigaria a pessoa a
  // decidir antes de ver qualquer coisa.
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDoMes(new Date()));
  // undefined = todas as contas. Escolher uma e refinamento, nao pre-requisito.
  const [contaId, setContaId] = useState<string | undefined>(undefined);
  const [baixando, setBaixando] = useState(false);
  const [erroPdf, setErroPdf] = useState<string | null>(null);

  const consulta = useExtratoDoPeriodo({ ...periodo, account_id: contaId });
  const paginas = consulta.data?.pages ?? [];
  const itens = paginas.flatMap((pagina) => pagina.items);
  // Do servidor, e do periodo inteiro. Somar os itens carregados daria um
  // numero que muda a cada "carregar mais".
  const totais = paginas[0]?.totals;

  const atalhos: Array<{ id: string; rotulo: string; calcular: () => Periodo }> = [
    { id: "mes", rotulo: t("statement:thisMonth"), calcular: () => periodoDoMes(new Date()) },
    { id: "passado", rotulo: t("statement:lastMonth"), calcular: () => periodoDoMes(new Date(), -1) },
    { id: "90", rotulo: t("statement:last90"), calcular: () => periodoDosUltimosDias(90, new Date()) },
  ];

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("statement:reportTitle")}</h1>

      <div className="flex flex-col gap-4 rounded-2xl border p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="periodo-de">{t("statement:from")}</Label>
            <Input
              id="periodo-de"
              type="date"
              value={periodo.date_from}
              onChange={(e) => setPeriodo({ ...periodo, date_from: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="periodo-ate">{t("statement:to")}</Label>
            <Input
              id="periodo-ate"
              type="date"
              value={periodo.date_to}
              onChange={(e) => setPeriodo({ ...periodo, date_to: e.target.value })}
            />
          </div>
          {atalhos.map((atalho) => (
            <Button
              key={atalho.id}
              variant="outline"
              className="rounded-full"
              onClick={() => setPeriodo(atalho.calcular())}
            >
              {atalho.rotulo}
            </Button>
          ))}
        </div>

        <div role="radiogroup" aria-label={t("account:title")} className="flex flex-wrap gap-2 p-1">
          <div
            data-testid="conta-filtro-todas"
            role="radio"
            aria-checked={contaId === undefined}
            aria-label={t("statement:allAccounts")}
            tabIndex={contaId === undefined ? 0 : -1}
            onClick={() => setContaId(undefined)}
            className={`cursor-pointer rounded-full border px-4 py-2 text-sm hover:bg-muted ${
              contaId === undefined ? "ring-2 ring-[var(--marca-2)]" : ""
            }`}
          >
            {t("statement:allAccounts")}
          </div>
          {(contas ?? []).map((c) => (
            <div
              key={c.id}
              data-testid={`conta-filtro-${c.id}`}
              role="radio"
              aria-checked={contaId === c.id}
              aria-label={c.alias ?? c.number}
              tabIndex={contaId === c.id ? 0 : -1}
              onClick={() => setContaId(c.id)}
              className={`flex cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm hover:bg-muted ${
                contaId === c.id ? "ring-2 ring-[var(--marca-2)]" : ""
              }`}
            >
              <InstitutionLogo instituicao={c.institution} />
              <span className="truncate">{c.alias ?? c.number}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          className="gap-2 rounded-full bg-gradient-to-r from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)] px-6 text-white"
          disabled={baixando}
          onClick={() => {
            setErroPdf(null);
            setBaixando(true);
            void baixarExtratoDoPeriodo({ ...periodo, account_id: contaId })
              .catch((falha: unknown) => {
                // PERIOD_TOO_LARGE cai aqui: o gateway recusa periodos que
                // nao cabem num PDF em vez de truncar, e a pessoa precisa
                // saber que deve encurtar o intervalo.
                setErroPdf(t(codigoTraduzivel(extrairErro(falha).code), { ns: "errors" }));
              })
              .finally(() => setBaixando(false));
          }}
        >
          <Download aria-hidden="true" className="size-4" />
          {t("statement:downloadPdf")}
        </Button>
      </div>

      {erroPdf !== null && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{erroPdf}</AlertDescription>
        </Alert>
      )}

      {consulta.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {t(codigoTraduzivel(extrairErro(consulta.error).code), { ns: "errors" })}
          </AlertDescription>
        </Alert>
      )}

      {totais !== undefined && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border p-4">
            <p className="text-sm text-muted-foreground">{t("statement:totalIn")}</p>
            <p
              data-testid="total-entradas"
              className="text-2xl font-bold text-green-600 dark:text-green-400"
            >
              {formatarDinheiro(paraCentavos(totais.total_in), locale)}
            </p>
          </div>
          <div className="rounded-2xl border p-4">
            <p className="text-sm text-muted-foreground">{t("statement:totalOut")}</p>
            <p
              data-testid="total-saidas"
              className="text-2xl font-bold text-rose-600 dark:text-rose-400"
            >
              {formatarDinheiro(paraCentavos(totais.total_out), locale)}
            </p>
          </div>
        </div>
      )}

      {itens.length === 0 && !consulta.isPending && !consulta.isError && (
        <p className="text-muted-foreground">{t("statement:empty")}</p>
      )}

      <ul>
        {itens.map((item) => (
          <StatementRow key={item.id} item={item} />
        ))}
      </ul>

      {consulta.hasNextPage && (
        <Button
          variant="outline"
          className="w-fit rounded-full"
          onClick={() => void consulta.fetchNextPage()}
          disabled={consulta.isFetchingNextPage}
        >
          {t("statement:loadMore")}
        </Button>
      )}
    </section>
  );
}
