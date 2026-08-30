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
import { Search } from "lucide-react";
import Modal from "@/components/layout/Modal";
import SourceAccountPicker from "@/features/transaction/SourceAccountPicker";
import TransferSteps from "@/features/transaction/TransferSteps";
import { useChaveDeIntencao } from "@/features/transaction/idempotency";
import { useTransferir } from "@/features/transaction/queries";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";
import {
  centavosDeDigitos,
  centavosParaDecimal,
  formatarDinheiro,
  paraCentavos,
} from "@/lib/money";

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
  const [confirmando, setConfirmando] = useState(false);
  const [busca, setBusca] = useState("");

  // As TRES entradas terminam no mesmo lugar: um account_id, que e o que o
  // gateway pede. Conta propria ja tem o id em maos; contato guarda o id da
  // conta alvo; a busca devolve o id.
  const destinoId =
    achada?.account_id ??
    (contatos ?? []).find((c) => c.id === contatoId)?.target_account.id ??
    "";

  /**
   * Transferencia entre contas PROPRIAS saiu desta tela.
   *
   * Ela pertence ao detalhe da conta, onde o usuario ja esta olhando saldos
   * — ver docs/superpowers/follow-ups-transferencia.md. Com contas proprias
   * fora, o destino e so de contatos, e o gateway recusa salvar a propria
   * conta como contato (ContactOwnAccount): a origem nao pode aparecer
   * entre os destinos nem por acidente, e as regras cruzadas que existiam
   * para isso deixaram de ter o que proteger.
   */
  const filtro = busca.trim().toLowerCase();
  const contatosVisiveis = (contatos ?? []).filter(
    (c) =>
      filtro === "" ||
      c.alias.toLowerCase().includes(filtro) ||
      c.target_account.holder_name.toLowerCase().includes(filtro),
  );
  const favoritos = (contatos ?? []).filter((c) => c.is_favorite);

  // A assinatura usa o MESMO valor que vai na requisicao (valor.trim()).
  // Editar so espaco em branco geraria chave nova para um payload identico,
  // e um reenvio depois de falha de rede criaria uma SEGUNDA transferencia.
  const { chave, limparChave } = useChaveDeIntencao({
    source_account_id: origemId,
    destination_account_id: destinoId,
    amount: valor.trim(),
  });

  const origem = (contas ?? []).find((c) => c.id === origemId);
  const destinoRotulo =
    achada?.holder_name ?? (contatos ?? []).find((c) => c.id === contatoId)?.alias ?? "";
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
  /**
   * Zera TUDO, nao so o campo visivel.
   *
   * Deixar a origem marcada faria o proximo preenchimento partir de um
   * estado que o usuario acha que descartou — e a origem e justamente a
   * escolha que ele nao ve depois de rolar a pagina.
   */
  function limparTudo() {
    setOrigemId("");
    setContatoId("");
    setValor("");
    setBusca("");
    setAchada(null);
    setBuscando(false);
    setErro(null);
  }

  async function aoEnviar() {
    setErro(null);
    setConfirmando(false);
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

  // valorCentavos, e nao string vazia: "0.00" nao e vazia, e a checagem
  // antiga habilitava o envio de uma transferencia de zero. O gateway
  // recusa (Amount tem gt=0), mas o usuario levava um 422 generico em vez de
  // simplesmente nao poder clicar — e o indicador de etapas ja dizia
  // "pendente" enquanto o botao dizia "pode enviar".
  const incompleto =
    origemId === "" || destinoId === "" || valorCentavos === null || valorCentavos <= 0;

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

      {/* A etapa do valor conta como concluida mesmo ACIMA do disponivel.
          Nao e descuido: o disponivel do cliente e estimativa (saldo menos
          pendencias) e a autoridade e o gateway — a propria mensagem diz
          "voce pode enviar mesmo assim". Marcar a etapa como pendente aqui
          contradiria isso em silencio. */}
      <TransferSteps
        etapas={[
          { id: "origem", rotulo: t("transaction:stepAccount"), feita: origemId !== "" },
          { id: "destino", rotulo: t("transaction:stepDestination"), feita: destinoId !== "" },
          {
            id: "valor",
            rotulo: t("transaction:stepAmount"),
            feita: valorCentavos !== null && valorCentavos > 0,
          },
        ]}
      />

      <SourceAccountPicker
        contas={contas ?? []}
        escolhida={origemId}
        // Sem limpar o destino: ele so lista contatos, e um contato nunca e
        // uma conta propria (o gateway recusa com ContactOwnAccount). A
        // origem escolhida jamais coincide com o destino.
        aoEscolher={setOrigemId}
      />

      {disponivelCentavos !== null && (
        <p data-testid="disponivel-origem" className="text-sm text-muted-foreground">
          {t("transaction:available")}: {formatarDinheiro(disponivelCentavos, i18n.language)}
        </p>
      )}

      {achada === null ? (
        /* Dois caminhos visualmente distintos, como o mockup pede. A
           separacao semantica ja existia nos dois optgroup do select e tem
           teste proprio; o que faltava era ela aparecer. O select foi
           mantido de proposito: e ele que carrega as regras cruzadas entre
           origem e destino, e troca-lo por uma lista de cartoes reescreveria
           quatro provas sem ganho para o usuario. */
        <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-xl border p-4">
          {/* Rotulo a esquerda e campo a direita, como o mockup: a busca e
              um refinamento da lista abaixo, nao um campo de formulario a
              preencher. */}
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="busca-contato" className="shrink-0">
              {t("transaction:searchContact")}
            </Label>
            <div className="relative w-full max-w-xs">
              <Input
                id="busca-contato"
                placeholder={t("transaction:searchPlaceholder")}
                className="pr-9"
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
              />
              <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          {/* Sugerido = favorito. Nao ha criterio de "mais usado" a inventar:
              o gateway nao expoe frequencia, e o usuario ja disse quem
              importa ao marcar a estrela. */}
          {favoritos.length > 0 && (
            <div data-testid="sugestoes" className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-sm text-muted-foreground">
                {t("transaction:suggested")}:
              </span>
              {favoritos.map((favorito) => (
                <button
                  key={favorito.id}
                  type="button"
                  onClick={() => setContatoId(favorito.id)}
                  className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm hover:bg-muted ${
                    contatoId === favorito.id ? "ring-2 ring-[var(--marca-2)]" : ""
                  }`}
                >
                  {/* Monograma no lugar da foto do mockup: o gateway nao
                      guarda imagem de contato, e o mesmo padrao ja resolve o
                      fallback do logo de banco. aria-hidden porque o nome vem
                      escrito ao lado — sem isso o leitor de tela anunciaria a
                      inicial e depois o nome. */}
                  <span
                    aria-hidden="true"
                    className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)] text-xs font-semibold text-white"
                  >
                    {favorito.alias.charAt(0).toUpperCase()}
                  </span>
                  <span className="font-medium">{favorito.alias}</span>
                </button>
              ))}
            </div>
          )}

          {/* Lista clicavel, e nao um <select>: com busca e sugeridos em
              volta, o dropdown obrigava a filtrar e ainda abrir uma lista
              para escolher. radiogroup pelo mesmo motivo do carrossel de
              origem — escolha unica com navegacao e estado anunciados. */}
          <div
            role="radiogroup"
            aria-label={t("transaction:destination")}
            // p-1 pelo mesmo motivo do carrossel de origem: o anel de
            // selecao e desenhado FORA do item e overflow-y-auto corta o que
            // passa dos limites — sem o respiro, o anel aparece cortado nas
            // laterais e no primeiro e no ultimo da lista.
            className="flex max-h-64 flex-col gap-1 overflow-y-auto p-1"
          >
            {contatosVisiveis.map((contato) => {
              const marcado = contato.id === contatoId;
              return (
                <div
                  key={contato.id}
                  data-testid={`destino-${contato.id}`}
                  role="radio"
                  aria-checked={marcado}
                  tabIndex={marcado ? 0 : -1}
                  onClick={() => setContatoId(contato.id)}
                  onKeyDown={(evento) => {
                    if (evento.key === " " || evento.key === "Enter") {
                      evento.preventDefault();
                      setContatoId(contato.id);
                    }
                  }}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-muted ${
                    marcado ? "bg-muted ring-2 ring-[var(--marca-2)]" : ""
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)] text-xs font-semibold text-white"
                  >
                    {contato.alias.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{contato.alias}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {contato.target_account.holder_name} ·{" "}
                      {contato.target_account.institution.name}
                    </span>
                  </span>
                </div>
              );
            })}

            {contatosVisiveis.length === 0 && (
              <p className="p-2 text-sm text-muted-foreground">{t("transaction:noMatch")}</p>
            )}
          </div>
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
        </div>

        <div className="flex flex-col gap-2 rounded-xl border p-4">
          <p className="text-sm font-medium">{t("transaction:manualEntry")}</p>
          {buscando ? (
            /* Sem o cancelar a insercao manual e caminho so de ida: quem
               clicou por engano fica com o formulario aberto e nenhuma forma
               de voltar aos contatos. */
            <AccountLookup onEncontrada={setAchada} aoCancelar={() => setBuscando(false)} />
          ) : (
            <Button variant="outline" onClick={() => setBuscando(true)}>
              {t("transaction:newAccount")}
            </Button>
          )}
        </div>
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

      {/* Valor e acao na mesma linha: o campo esticado na largura da pagina
          sugeria um texto longo, quando o conteudo sao poucos digitos. */}
      <div className="flex flex-wrap items-end gap-3">
        {/* w-56: a mesma largura dos cartoes de conta, para a coluna do
            valor alinhar com o carrossel acima. */}
        <div className="flex w-56 flex-col gap-2">
          <Label htmlFor="transferencia-valor">{t("transaction:value")}</Label>
          {/* O ESTADO continua sendo a string decimal canonica ("100.00"):
              e ela que vai no payload e que alimenta a chave de
              idempotencia. A mascara e so o que se ve — guardar o texto
              formatado faria a chave mudar com a pontuacao e o payload
              chegar no formato errado ao gateway. */}
          <Input
            id="transferencia-valor"
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

        {/* O botao NAO desabilita por causa do disponivel: quem decide e o servidor. */}
        <Button
          className="rounded-full bg-gradient-to-r from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)] px-8 text-white"
          onClick={() => setConfirmando(true)}
          disabled={incompleto || transferir.isPending}
        >
          {t("transaction:continue")}
        </Button>

        {/* Vermelho so no hover: descartar o preenchimento e reversivel
            refazendo, mas nao merece parecer uma acao neutra ao lado da
            acao principal. */}
        <Button
          variant="ghost"
          className="rounded-full hover:bg-destructive/10 hover:text-destructive"
          onClick={limparTudo}
        >
          {t("transaction:clearAll")}
        </Button>
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

      {/* A revisao antes de mover dinheiro. A chave de idempotencia nasce de
          (origem, destino, valor) e nenhum dos tres muda enquanto isto esta
          aberto — abrir, desistir e reabrir mantem a MESMA chave, senao a
          hesitacao do usuario viraria transferencia duplicada. */}
      {confirmando && (
        <Modal titulo={t("transaction:reviewTitle")} aoFechar={() => setConfirmando(false)}>
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("transaction:source")}</dt>
              <dd className="text-right font-medium">
                {origem?.alias ?? origem?.number} · {origem?.institution.name}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("transaction:destination")}</dt>
              <dd className="text-right font-medium">{destinoRotulo}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("transaction:value")}</dt>
              <dd className="text-right text-lg font-bold">
                {valorCentavos === null
                  ? valor
                  : formatarDinheiro(valorCentavos, i18n.language)}
              </dd>
            </div>
            {disponivelCentavos !== null && valorCentavos !== null && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("transaction:afterTransfer")}</dt>
                <dd className="text-right font-medium">
                  {formatarDinheiro(disponivelCentavos - valorCentavos, i18n.language)}
                </dd>
              </div>
            )}
          </dl>

          {acimaDoDisponivel && (
            <Alert role="status" className="mt-4">
              <AlertDescription>{t("transaction:overAvailable")}</AlertDescription>
            </Alert>
          )}

          <div className="mt-6 flex gap-2">
            <Button
              className="flex-1 rounded-full bg-gradient-to-r from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)] text-white"
              onClick={() => void aoEnviar()}
              disabled={transferir.isPending}
            >
              {transferir.isPending ? t("transaction:sending") : t("transaction:confirm")}
            </Button>
            <Button
              variant="ghost"
              className="rounded-full"
              onClick={() => setConfirmando(false)}
            >
              {t("contact:cancel")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
