import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useContas } from "@/features/account/queries";
import { useChaveDeIntencao } from "@/features/transaction/idempotency";
import { useDepositar } from "@/features/transaction/queries";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";
import {
  centavosDeDigitos,
  centavosParaDecimal,
  formatarDinheiro,
  paraCentavos,
} from "@/lib/money";
import SourceAccountPicker from "@/features/transaction/SourceAccountPicker";
import TransferSteps from "@/features/transaction/TransferSteps";

export default function DepositPage() {
  const { t, i18n } = useTranslation(["transaction", "errors"]);
  const navegar = useNavigate();
  const { data: contas, isError: contasComErro, error: erroContas } = useContas();
  const depositar = useDepositar();
  const [contaId, setContaId] = useState("");
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  // A chave morre e renasce junto com a intencao: mudar a conta ou o valor
  // torna isto outro pedido, e o gateway precisa saber disso.
  const { chave, limparChave } = useChaveDeIntencao({
    account_id: contaId,
    amount: valor.trim(),
  });

  async function aoEnviar() {
    setErro(null);
    try {
      const { transacao, criadaAgora } = await depositar.mutateAsync({
        entrada: { account_id: contaId, amount: valor.trim() },
        chave,
      });
      limparChave();
      navegar(`/transacoes/${transacao.id}`, { state: { criadaAgora } });
    } catch (falha) {
      setErro(t(codigoTraduzivel(extrairErro(falha).code), { ns: "errors" }));
    }
  }

  // Nao basta a string nao ser vazia: "0" e "0,00" passavam e habilitavam
  // um deposito de zero, que o gateway recusa (Amount tem gt=0). O try/catch
  // e necessario porque paraCentavos LANCA em texto invalido — enquanto se
  // digita, o campo passa por estados que nao sao numero.
  const valorCentavos = (() => {
    try {
      return valor.trim() === "" ? null : paraCentavos(valor.trim());
    } catch {
      return null;
    }
  })();
  const incompleto = contaId === "" || valorCentavos === null || valorCentavos <= 0;

  // A falha de rede nao pode se disfarcar de "voce nao tem contas": as duas
  // renderizariam o mesmo select vazio, e depositar e a UNICA forma de por
  // dinheiro numa conta. Mesmo padrao de AccountsPage.tsx.
  if (contasComErro) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>
          {t(codigoTraduzivel(extrairErro(erroContas).code), { ns: "errors" })}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("transaction:depositTitle")}</h1>

      <TransferSteps
        etapas={[
          { id: "conta", rotulo: t("transaction:stepAccount"), feita: contaId !== "" },
          {
            id: "valor",
            rotulo: t("transaction:stepAmount"),
            feita: valorCentavos !== null && valorCentavos > 0,
          },
        ]}
      />

      {/* bloquearSemSaldo desligado: conta zerada e o destino mais util de um
          deposito. O bloqueio existe para a ORIGEM de uma transferencia, onde
          nao ha o que enviar — aqui seria um bug. */}
      <SourceAccountPicker
        contas={contas ?? []}
        escolhida={contaId}
        aoEscolher={setContaId}
        rotulo={t("transaction:account")}
        bloquearSemSaldo={false}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-56 flex-col gap-2">
          <Label htmlFor="deposito-valor">{t("transaction:value")}</Label>
          {/* Mesmo desenho da transferencia: o estado e a string decimal
              canonica, a mascara e so apresentacao. */}
          <Input
            id="deposito-valor"
            inputMode="numeric"
            className="text-lg"
            placeholder={formatarDinheiro(0, i18n.language)}
            value={
              valorCentavos === null ? "" : formatarDinheiro(valorCentavos, i18n.language)
            }
            onChange={(evento) => {
              const centavos = centavosDeDigitos(evento.target.value);
              setValor(centavos === null ? "" : centavosParaDecimal(centavos));
            }}
          />
        </div>

        <Button
          className="rounded-full bg-gradient-to-r from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)] px-8 text-white"
          onClick={() => void aoEnviar()}
          disabled={incompleto || depositar.isPending}
        >
          {depositar.isPending ? t("transaction:sending") : t("transaction:send")}
        </Button>
      </div>

      {erro && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

    </div>
  );
}
