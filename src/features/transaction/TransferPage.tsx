import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useContas } from "@/features/account/queries";
import AccountLookup from "@/features/contact/AccountLookup";
import { useContatos } from "@/features/contact/queries";
import type { ResultadoBusca } from "@/features/contact/types";
import { usePendentesDeSaida } from "@/features/statement/queries";
import { useChaveDeIntencao } from "@/features/transaction/idempotency";
import { useTransferir } from "@/features/transaction/queries";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";
import { formatarDinheiro, paraCentavos } from "@/lib/money";

export default function TransferPage() {
  const { t, i18n } = useTranslation(["transaction", "contact", "errors"]);
  const navegar = useNavigate();
  const { data: contas } = useContas();
  const { data: contatos } = useContatos();
  const transferir = useTransferir();

  const [origemId, setOrigemId] = useState("");
  const [contatoId, setContatoId] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [achada, setAchada] = useState<ResultadoBusca | null>(null);
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  // As duas entradas terminam no mesmo lugar: um account_id, que e o que o
  // gateway pede. Contato e conveniencia da interface, nada mais.
  const destinoId =
    achada?.account_id ??
    (contatos ?? []).find((c) => c.id === contatoId)?.target_account.id ??
    "";

  const { chave, limparChave } = useChaveDeIntencao({
    source_account_id: origemId,
    destination_account_id: destinoId,
    amount: valor,
  });

  const origem = (contas ?? []).find((c) => c.id === origemId);
  const pendentes = usePendentesDeSaida(origemId);
  // Mesma regra de PendingBalanceLine.tsx: enquanto a consulta de pendentes
  // carrega, ou se ela falhar, "disponivel = saldo - 0" mostraria o saldo
  // CHEIO como se estivesse confirmado. Sem disponivel confiavel, nao ha
  // "disponivel" para mostrar nem "acima do disponivel" para avisar.
  const disponivelCentavos =
    origem === undefined || pendentes.isPending || pendentes.isError
      ? null
      : paraCentavos(origem.balance) - pendentes.centavos;
  const valorCentavos = (() => {
    try {
      return valor.trim() === "" ? null : paraCentavos(valor.trim());
    } catch {
      return null;
    }
  })();
  const acimaDoDisponivel =
    disponivelCentavos !== null && valorCentavos !== null && valorCentavos > disponivelCentavos;

  async function aoEnviar() {
    setErro(null);
    try {
      const { transacao, criadaAgora } = await transferir.mutateAsync({
        entrada: {
          source_account_id: origemId,
          destination_account_id: destinoId,
          amount: valor.trim(),
        },
        chave,
      });
      limparChave();
      navegar(`/transacoes/${transacao.id}`, {
        state: { criadaAgora, destinoNaoSalvo: achada?.account_id ?? null },
      });
    } catch (falha) {
      setErro(t(codigoTraduzivel(extrairErro(falha).code), { ns: "errors" }));
    }
  }

  const incompleto = origemId === "" || destinoId === "" || valor.trim() === "";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("transaction:transferTitle")}</h1>

      <div className="flex flex-col gap-2">
        <Label htmlFor="transferencia-origem">{t("transaction:source")}</Label>
        <select
          id="transferencia-origem"
          className="rounded border px-2 py-1"
          value={origemId}
          onChange={(evento) => setOrigemId(evento.target.value)}
        >
          <option value="" />
          {(contas ?? []).map((conta) => (
            <option key={conta.id} value={conta.id}>
              {conta.alias ?? conta.number} · {conta.institution.name}
            </option>
          ))}
        </select>
      </div>

      {disponivelCentavos !== null && (
        <p className="text-sm text-muted-foreground">
          {t("transaction:available")}: {formatarDinheiro(disponivelCentavos, i18n.language)}
        </p>
      )}

      {pendentes.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {t(codigoTraduzivel(extrairErro(pendentes.error).code), { ns: "errors" })}
          </AlertDescription>
        </Alert>
      )}

      {achada === null ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="transferencia-destino">{t("transaction:destination")}</Label>
          <select
            id="transferencia-destino"
            className="rounded border px-2 py-1"
            value={contatoId}
            onChange={(evento) => setContatoId(evento.target.value)}
          >
            <option value="" />
            {(contatos ?? []).map((contato) => (
              <option key={contato.id} value={contato.id}>
                {contato.alias} · {contato.target_account.holder_name}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={() => setBuscando(true)}>
            {t("transaction:newAccount")}
          </Button>
          {buscando && <AccountLookup onEncontrada={setAchada} />}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{t("contact:found")}</p>
          <p className="text-sm">{achada.holder_name}</p>
          <p className="text-sm">{achada.institution.name}</p>
          <Button
            variant="outline"
            onClick={() => {
              setAchada(null);
              setBuscando(false);
            }}
          >
            {t("contact:cancel")}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="transferencia-valor">{t("transaction:value")}</Label>
        <Input
          id="transferencia-valor"
          inputMode="decimal"
          value={valor}
          onChange={(evento) => setValor(evento.target.value)}
        />
      </div>

      {acimaDoDisponivel && (
        <Alert role="status">
          <AlertDescription>{t("transaction:overAvailable")}</AlertDescription>
        </Alert>
      )}

      {erro && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {/* O botao NAO desabilita por causa do disponivel: quem decide e o servidor. */}
      <Button onClick={() => void aoEnviar()} disabled={incompleto || transferir.isPending}>
        {transferir.isPending ? t("transaction:sending") : t("transaction:send")}
      </Button>
    </div>
  );
}
