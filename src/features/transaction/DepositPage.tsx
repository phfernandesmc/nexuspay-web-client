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

export default function DepositPage() {
  const { t } = useTranslation(["transaction", "errors"]);
  const navegar = useNavigate();
  const { data: contas } = useContas();
  const depositar = useDepositar();
  const [contaId, setContaId] = useState("");
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  // A chave morre e renasce junto com a intencao: mudar a conta ou o valor
  // torna isto outro pedido, e o gateway precisa saber disso.
  const { chave, limparChave } = useChaveDeIntencao({ account_id: contaId, amount: valor });

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

  const incompleto = contaId === "" || valor.trim() === "";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("transaction:depositTitle")}</h1>

      <div className="flex flex-col gap-2">
        <Label htmlFor="deposito-conta">{t("transaction:account")}</Label>
        <select
          id="deposito-conta"
          className="rounded border px-2 py-1"
          value={contaId}
          onChange={(evento) => setContaId(evento.target.value)}
        >
          <option value="" />
          {(contas ?? []).map((conta) => (
            <option key={conta.id} value={conta.id}>
              {conta.alias ?? conta.number} · {conta.institution.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="deposito-valor">{t("transaction:value")}</Label>
        <Input
          id="deposito-valor"
          inputMode="decimal"
          value={valor}
          onChange={(evento) => setValor(evento.target.value)}
        />
      </div>

      {erro && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <Button onClick={() => void aoEnviar()} disabled={incompleto || depositar.isPending}>
        {depositar.isPending ? t("transaction:sending") : t("transaction:send")}
      </Button>
    </div>
  );
}
