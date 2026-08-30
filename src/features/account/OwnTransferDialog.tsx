import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Modal from "@/components/layout/Modal";
import InstitutionLogo from "@/features/institution/InstitutionLogo";
import { useContas } from "@/features/account/queries";
import type { Conta } from "@/features/account/types";
import { useChaveDeIntencao } from "@/features/transaction/idempotency";
import { useTransferir } from "@/features/transaction/queries";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";
import {
  centavosDeDigitos,
  centavosParaDecimal,
  formatarDinheiro,
  paraCentavos,
} from "@/lib/money";

/**
 * Transferencia entre contas do MESMO dono, a partir do detalhe da conta.
 *
 * Vive aqui, e nao na tela de transferencia, porque a origem ja e conhecida:
 * e a conta que a pessoa esta olhando. Na tela generica, misturar contas
 * proprias com contatos arrastava quatro regras cruzadas (a origem sumir do
 * destino, trocar a origem limpar ou preservar o destino) que existiam so
 * por causa dessa mistura. Ver docs/superpowers/follow-ups-transferencia.md.
 */
export default function OwnTransferDialog({
  conta,
  aoFechar,
}: {
  conta: Conta;
  aoFechar: () => void;
}) {
  const { t, i18n } = useTranslation(["account", "transaction", "contact", "errors"]);
  const navegar = useNavigate();
  const { data: contas } = useContas();
  const transferir = useTransferir();
  const [destinoId, setDestinoId] = useState("");
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const { chave, limparChave } = useChaveDeIntencao({
    source_account_id: conta.id,
    destination_account_id: destinoId,
    amount: valor.trim(),
  });

  const valorCentavos = (() => {
    try {
      return valor.trim() === "" ? null : paraCentavos(valor.trim());
    } catch {
      return null;
    }
  })();

  // A propria conta e as encerradas ficam de fora: transferir para si mesma
  // e recusado pelo gateway (SAME_ACCOUNT_TRANSFER) e conta encerrada nao
  // recebe. Oferecer as duas seria convidar a um erro que so aparece depois
  // do envio.
  const destinos = (contas ?? []).filter(
    (outra) => outra.id !== conta.id && outra.status !== "CLOSED",
  );

  const incompleto = destinoId === "" || valorCentavos === null || valorCentavos <= 0;

  async function aoConfirmar() {
    setErro(null);
    try {
      const { transacao, criadaAgora } = await transferir.mutateAsync({
        entrada: {
          source_account_id: conta.id,
          destination_account_id: destinoId,
          amount: valor.trim(),
        },
        chave,
      });
      limparChave();
      navegar(`/transacoes/${transacao.id}`, { state: { criadaAgora, destinoNaoSalvo: null } });
    } catch (falha) {
      setErro(t(codigoTraduzivel(extrairErro(falha).code), { ns: "errors" }));
    }
  }

  return (
    <Modal titulo={t("account:ownTransfer")} aoFechar={aoFechar}>
      <p className="text-sm text-muted-foreground">
        {t("transaction:source")}: {conta.alias ?? conta.number} · {conta.institution.name}
      </p>

      <p className="mt-4 mb-2 text-sm font-medium" id="rotulo-destino-proprio">
        {t("transaction:destination")}
      </p>
      <div
        role="radiogroup"
        aria-labelledby="rotulo-destino-proprio"
        className="flex max-h-48 flex-col gap-1 overflow-y-auto p-1"
      >
        {destinos.map((outra) => {
          const marcada = outra.id === destinoId;
          return (
            <div
              key={outra.id}
              data-testid={`destino-${outra.id}`}
              role="radio"
              aria-checked={marcada}
              tabIndex={marcada ? 0 : -1}
              onClick={() => setDestinoId(outra.id)}
              onKeyDown={(evento) => {
                if (evento.key === " " || evento.key === "Enter") {
                  evento.preventDefault();
                  setDestinoId(outra.id);
                }
              }}
              className={`flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-muted ${
                marcada ? "bg-muted ring-2 ring-[var(--marca-2)]" : ""
              }`}
            >
              <InstitutionLogo instituicao={outra.institution} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {outra.alias ?? outra.number}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {outra.institution.name} ·{" "}
                  {formatarDinheiro(paraCentavos(outra.balance), i18n.language)}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Label htmlFor="valor-proprio">{t("transaction:value")}</Label>
        {/* Mesmo desenho das outras telas: o estado e a string decimal
            canonica, a mascara e so apresentacao. */}
        <Input
          id="valor-proprio"
          inputMode="numeric"
          className="text-lg"
          placeholder={formatarDinheiro(0, i18n.language)}
          value={valorCentavos === null ? "" : formatarDinheiro(valorCentavos, i18n.language)}
          onChange={(evento) => {
            const centavos = centavosDeDigitos(evento.target.value);
            setValor(centavos === null ? "" : centavosParaDecimal(centavos));
          }}
        />
      </div>

      {erro !== null && (
        <Alert variant="destructive" role="alert" className="mt-4">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <div className="mt-6 flex gap-2">
        <Button
          className="flex-1 rounded-full bg-gradient-to-r from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)] text-white"
          onClick={() => void aoConfirmar()}
          disabled={incompleto || transferir.isPending}
        >
          {transferir.isPending ? t("transaction:sending") : t("transaction:confirm")}
        </Button>
        <Button variant="ghost" className="rounded-full" onClick={aoFechar}>
          {t("contact:cancel")}
        </Button>
      </div>
    </Modal>
  );
}
