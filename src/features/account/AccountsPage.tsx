import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeftRight, Plus } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import Modal from "@/components/layout/Modal";
import InstitutionLogo from "@/features/institution/InstitutionLogo";
import { paraCentavos, formatarDinheiro } from "@/lib/money";
import AccountCard from "@/features/account/AccountCard";
import OpenAccountDialog from "@/features/account/OpenAccountDialog";
import { useContas } from "@/features/account/queries";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";

export default function AccountsPage() {
  const { t, i18n } = useTranslation(["account", "common", "errors"]);
  const { data: contas, isPending, isError, error } = useContas();
  const [abrindo, setAbrindo] = useState(false);
  const [escolhendoOrigem, setEscolhendoOrigem] = useState(false);

  // Mesmo criterio da acao no detalhe: sem saldo nao ha o que enviar, e
  // conta encerrada nao opera.
  const elegiveis = (contas ?? []).filter(
    (c) => c.status !== "CLOSED" && paraCentavos(c.balance) > 0,
  );

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("account:title")}</h1>

        {/* So aparece com pelo menos duas contas elegiveis: com uma so nao ha
            para onde transferir, e o botao levaria a um dialogo vazio. */}
        {elegiveis.length >= 2 && (
          <Button
            className="gap-2 rounded-full bg-gradient-to-r from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)] px-6 text-white"
            onClick={() => setEscolhendoOrigem(true)}
          >
            <ArrowLeftRight aria-hidden="true" className="size-4" />
            {t("account:ownTransfer")}
          </Button>
        )}
      </div>

      {escolhendoOrigem && (
        <Modal titulo={t("account:chooseSource")} aoFechar={() => setEscolhendoOrigem(false)}>
          {/* Cada origem e um LINK para o detalhe daquela conta, com a
              intencao no state. Escolher a origem vira NAVEGACAO em vez de
              estado de formulario — e o que impede as regras cruzadas entre
              origem e destino de voltarem para esta tela. De quebra, a pessoa
              chega onde ve o saldo daquela conta. */}
          <div className="flex flex-col gap-1">
            {elegiveis.map((elegivel) => (
              <Link
                key={elegivel.id}
                to={`/contas/${elegivel.id}`}
                state={{ transferirAgora: true }}
                className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted"
              >
                <InstitutionLogo instituicao={elegivel.institution} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {elegivel.alias ?? elegivel.number}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {elegivel.institution.name} ·{" "}
                    {formatarDinheiro(paraCentavos(elegivel.balance), i18n.language)}
                  </span>
                </span>
              </Link>
            ))}
          </div>

          {/* Sem este botao, sair do dialogo exigia clicar fora ou saber que
              Escape fecha — duas saidas que ninguem anuncia. E aqui pesa
              mais que nos outros modais: TODAS as opcoes da lista sao links
              que navegam, entao nao existe nenhum controle inofensivo para
              clicar por engano enquanto se decide.

              Vermelho so no hover: desistir e reversivel, mas a cor confirma
              a intencao no momento do clique. */}
          <Button
            variant="ghost"
            className="mt-4 w-full rounded-full hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setEscolhendoOrigem(false)}
          >
            {t("account:cancel")}
          </Button>
        </Modal>
      )}

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
