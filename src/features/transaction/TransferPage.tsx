import { useState } from "react";
import type { ChangeEvent } from "react";
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
import { useChaveDeIntencao } from "@/features/transaction/idempotency";
import { useTransferir } from "@/features/transaction/queries";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";
import { formatarDinheiro, paraCentavos } from "@/lib/money";

export default function TransferPage() {
  const { t, i18n } = useTranslation(["transaction", "contact", "errors"]);
  const navegar = useNavigate();
  const { data: contas, isError: contasComErro, error: erroContas } = useContas();
  const { data: contatos, isError: contatosComErro, error: erroContatos } = useContatos();
  const transferir = useTransferir();

  const [origemId, setOrigemId] = useState("");
  const [contatoId, setContatoId] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [achada, setAchada] = useState<ResultadoBusca | null>(null);
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  // As TRES entradas terminam no mesmo lugar: um account_id, que e o que o
  // gateway pede. Conta propria ja tem o id em maos; contato guarda o id da
  // conta alvo; a busca devolve o id.
  const destinoId =
    achada?.account_id ??
    (contas ?? []).find((c) => c.id === contatoId)?.id ??
    (contatos ?? []).find((c) => c.id === contatoId)?.target_account.id ??
    "";

  // A assinatura usa o MESMO valor que vai na requisicao (valor.trim()).
  // Editar so espaco em branco geraria chave nova para um payload identico,
  // e um reenvio depois de falha de rede criaria uma SEGUNDA transferencia.
  const { chave, limparChave } = useChaveDeIntencao({
    source_account_id: origemId,
    destination_account_id: destinoId,
    amount: valor.trim(),
  });

  const origem = (contas ?? []).find((c) => c.id === origemId);
  // O pendente vem junto com a conta. Ate a Fatia 3c isto era derivado de
  // uma consulta ao extrato com limit=100, e podia ficar MAIOR que o real.
  const disponivelCentavos =
    origem === undefined
      ? null
      : paraCentavos(origem.balance) - paraCentavos(origem.pending_outgoing);
  const valorCentavos = (() => {
    try {
      return valor.trim() === "" ? null : paraCentavos(valor.trim());
    } catch {
      return null;
    }
  })();
  const acimaDoDisponivel =
    disponivelCentavos !== null && valorCentavos !== null && valorCentavos > disponivelCentavos;

  // Trocar a origem para a conta que estava escolhida como destino faz a
  // <option> sumir do select de destino (filtrado pela origem), mas o
  // DOM sumir nao limpa o estado React sozinho: contatoId continuaria
  // "conta-2", o botao ficaria habilitavel, e o envio mandaria origem ==
  // destino — exatamente o erro que o filtro deveria eliminar por
  // construcao (SAME_ACCOUNT_TRANSFER por outra porta).
  function aoTrocarOrigem(evento: ChangeEvent<HTMLSelectElement>) {
    const novaOrigemId = evento.target.value;
    setOrigemId(novaOrigemId);
    if (novaOrigemId !== "" && novaOrigemId === contatoId) {
      setContatoId("");
    }
  }

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

  // A falha de rede nao pode se disfarcar de "voce nao tem contas": o select
  // vazio e "voce nao tem contas" renderizam identico, e sem uma conta de
  // origem nao ha nada que esta tela possa fazer. Mesmo padrao de
  // AccountsPage.tsx e DepositPage.tsx.
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
      <h1 className="text-2xl font-semibold">{t("transaction:transferTitle")}</h1>

      <div className="flex flex-col gap-2">
        <Label htmlFor="transferencia-origem">{t("transaction:source")}</Label>
        <select
          id="transferencia-origem"
          className="rounded border px-2 py-1"
          value={origemId}
          onChange={aoTrocarOrigem}
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
            <optgroup label={t("transaction:myAccounts")}>
              {(contas ?? [])
                // A origem sai da lista: mandar para a mesma conta e recusado
                // pelo gateway, e nao ha por que oferecer o erro.
                .filter((c) => c.id !== origemId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.alias ?? c.number} · {c.institution.name} · {c.number}
                  </option>
                ))}
            </optgroup>
            <optgroup label={t("transaction:myContacts")}>
              {(contatos ?? []).map((contato) => (
                <option key={contato.id} value={contato.id}>
                  {contato.alias} · {contato.target_account.holder_name}
                </option>
              ))}
            </optgroup>
          </select>
          {/* A falha de rede nao pode se disfarcar de "voce nao tem contatos":
              o select vazio ficaria identico ao "sem contatos salvos ainda".
              "Buscar outra conta" continua funcionando sem esta lista, entao
              o alerta e inline em vez de bloquear a tela inteira. */}
          {contatosComErro && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {t(codigoTraduzivel(extrairErro(erroContatos).code), { ns: "errors" })}
              </AlertDescription>
            </Alert>
          )}
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
