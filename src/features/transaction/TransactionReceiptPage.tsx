import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Clock, ReceiptText, XCircle } from "lucide-react";
import { useSalvarContato } from "@/features/contact/queries";
import { motivoTraduzivel, useTransacao } from "@/features/transaction/queries";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";
import { formatarDataHora } from "@/lib/datetime";
import { formatarDinheiro, paraCentavos } from "@/lib/money";

export default function TransactionReceiptPage() {
  const { t, i18n } = useTranslation(["transaction", "contact", "errors"]);
  const { id = "" } = useParams<{ id: string }>();
  const local = useLocation();
  const navegar = useNavigate();
  const { data: transacao, isPending, isError, error, refetch, isFetching } = useTransacao(id);
  const salvarContato = useSalvarContato();
  const [salvandoContato, setSalvandoContato] = useState(false);
  const [aliasNovo, setAliasNovo] = useState("");
  const [erroContato, setErroContato] = useState<string | null>(null);
  // So vira true depois que o servidor confirma. Sem isso o botao e o
  // formulario voltariam a aparecer com o mesmo destino ja salvo, e um
  // segundo envio bateria em CONTACT_ALREADY_EXISTS por fazer exatamente o
  // que a tela ofereceu.
  const [contatoSalvo, setContatoSalvo] = useState(false);
  const [espera, setEspera] = useState(0);

  /**
   * Cooldown do botao de atualizar.
   *
   * NAO e protecao contra bot: bot nao usa a interface, e quem o barra e o
   * rate limit do gateway (DEFAULT_LIMIT, 60/minuto). Isto existe para quem
   * esta ansioso esperando o dinheiro cair nao martelar o botao e levar um
   * 429 na propria cara. Cinco segundos poem o teto em 12 requisicoes por
   * minuto, folgado abaixo do limite do servidor.
   */
  useEffect(() => {
    if (espera === 0) return;
    const timer = setTimeout(() => setEspera((restante) => restante - 1), 1000);
    return () => clearTimeout(timer);
  }, [espera]);

  // O history.state do navegador NAO se perde num recarregamento — ele fica
  // preso a entrada do historico de sessao, nao a montagem do componente
  // (comportamento documentado da History API, nao peculiaridade de
  // nenhuma engine). Se so lessemos local.state a cada render, um F5 real
  // devolveria o MESMO state de quando a transacao foi criada, e o recibo
  // diria "enviada agora" para sempre a cada recarregamento — que e
  // exatamente a mentira que este trecho existe para evitar.
  //
  // A saida e ler o state uma unica vez, na primeira renderizacao (o
  // inicializador de useState so roda no mount), e so DEPOIS trocar a
  // entrada do historico por uma sem state (useEffect abaixo, com
  // replace: true para nao empilhar uma entrada nova). Dali em diante,
  // inclusive apos um reload, local.state chega null e o recibo nao afirma
  // mais nada sobre novidade.
  const [estadoCapturado] = useState(
    () =>
      local.state as {
        criadaAgora?: boolean;
        destinoNaoSalvo?: string | null;
      } | null,
  );

  useEffect(() => {
    if (local.state === null) return;
    navegar(local.pathname, { replace: true, state: null });
    // Roda so uma vez, no mount: e o consumo unico do state capturado acima,
    // nao uma reacao a mudancas de local ao longo da vida do componente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // So existe quando o recibo foi alcancado logo depois do envio. Depois de
  // um recarregamento fica undefined, e ai o recibo nao afirma nada sobre
  // novidade — dizer "enviada agora" seria mentira.
  const criadaAgora = estadoCapturado?.criadaAgora;

  // Só existe quando o destino veio de uma busca. Transferencia para
  // contato salvo nao tem o que salvar.
  const destinoNaoSalvo = estadoCapturado?.destinoNaoSalvo ?? null;

  if (isError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>
          {t(codigoTraduzivel(extrairErro(error).code), { ns: "errors" })}
        </AlertDescription>
      </Alert>
    );
  }

  if (isPending) return null;

  // Em DEPOSIT o dinheiro nao sai de conta nenhuma: source_account_id e
  // sempre null. Um botao que so aparece com source_account_id deixaria
  // todo comprovante de deposito sem caminho de volta. destination_account_id
  // e obrigatorio nos dois tipos, entao ele e o destino certo para DEPOSIT e
  // o fallback seguro se source_account_id vier nulo por algum motivo.
  const contaDoRecibo =
    transacao.type === "DEPOSIT"
      ? transacao.destination_account_id
      : (transacao.source_account_id ?? transacao.destination_account_id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("transaction:receiptTitle")}</h1>

      {criadaAgora === true && <p>{t("transaction:createdNow")}</p>}
      {criadaAgora === false && (
        <Alert role="status">
          <AlertDescription>{t("transaction:replayed")}</AlertDescription>
        </Alert>
      )}

      {/* O status e a pergunta que traz alguem aqui: "passou?". Antes ele era
          uma linha igual as outras quatro. Agora e o bloco principal, e o
          valor aparece junto porque as duas informacoes so fazem sentido
          lidas ao mesmo tempo. */}
      <section
        className={`flex items-center gap-4 rounded-2xl border p-6 ${
          transacao.status === "COMPLETED"
            ? "border-green-600/30 bg-green-600/5"
            : transacao.status === "FAILED"
              ? "border-destructive/30 bg-destructive/5"
              : "border-amber-500/30 bg-amber-500/5"
        }`}
      >
        {/* aria-hidden: o estado ja esta escrito ao lado. O icone reforca
            para quem ve e nao pode ser a unica forma de saber. */}
        <span aria-hidden="true">
          {transacao.status === "COMPLETED" ? (
            <CheckCircle2 className="size-10 text-green-600 dark:text-green-400" />
          ) : transacao.status === "FAILED" ? (
            <XCircle className="size-10 text-destructive" />
          ) : (
            <Clock className="size-10 text-amber-600 dark:text-amber-400" />
          )}
        </span>

        <div className="min-w-0">
          <p className="text-3xl font-bold">
            {formatarDinheiro(paraCentavos(transacao.amount), i18n.language)}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("transaction:statusLabel")}: {t(`transaction:${transacao.status}`)}
          </p>
        </div>
      </section>

      {transacao.status === "PENDING" && (
        <Alert role="status">
          <AlertDescription>{t("transaction:pendingExplained")}</AlertDescription>
        </Alert>
      )}

      {transacao.status === "FAILED" && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {t(motivoTraduzivel(transacao.failure_reason), { ns: "errors" })}
          </AlertDescription>
        </Alert>
      )}

      <dl className="flex flex-col gap-3 rounded-2xl border p-6 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{t("transaction:type")}</dt>
          <dd className="font-medium">{t(`transaction:${transacao.type}`)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{t("transaction:when")}</dt>
          <dd className="font-medium">
            {formatarDataHora(transacao.created_at, i18n.language)}
          </dd>
        </div>
      </dl>

      {destinoNaoSalvo !== null && !contatoSalvo && !salvandoContato && (
        <Button variant="outline" onClick={() => setSalvandoContato(true)}>
          {t("transaction:saveContact")}
        </Button>
      )}

      {destinoNaoSalvo !== null && !contatoSalvo && salvandoContato && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="recibo-alias">{t("contact:alias")}</Label>
          <Input
            id="recibo-alias"
            maxLength={50}
            value={aliasNovo}
            onChange={(evento) => setAliasNovo(evento.target.value)}
          />
          {erroContato && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{erroContato}</AlertDescription>
            </Alert>
          )}
          <Button
            disabled={aliasNovo.trim() === "" || salvarContato.isPending}
            onClick={() => {
              setErroContato(null);
              void salvarContato
                .mutateAsync({
                  account_id: destinoNaoSalvo,
                  alias: aliasNovo.trim(),
                  is_favorite: false,
                })
                .then(() => {
                  setSalvandoContato(false);
                  setContatoSalvo(true);
                })
                .catch((falha: unknown) => {
                  setErroContato(
                    t(codigoTraduzivel(extrairErro(falha).code), { ns: "errors" }),
                  );
                });
            }}
          >
            {t("contact:save")}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {/* So aparece em PENDING. COMPLETED e FAILED sao terminais — o
            worker nao volta atras —, e um botao de atualizar ali sugere que
            a resposta ainda pode mudar. */}
        {transacao.status === "PENDING" && (
          <Button
            className="rounded-full bg-gradient-to-r from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)] px-8 text-white"
            onClick={() => {
              setEspera(5);
              void refetch();
            }}
            disabled={isFetching || espera > 0}
          >
            {isFetching
              ? t("transaction:refreshing")
              : espera > 0
                ? t("transaction:refreshCooldown", { segundos: espera })
                : t("transaction:refresh")}
          </Button>
        )}
        {/* Nao usa <Button render={<Link .../>}>: este controle NAVEGA, entao
        precisa continuar sendo um link de verdade (role="link", nao
        "button") para leitor de tela e Ctrl+clique/abrir em nova aba. O
        primitivo Button do base-ui, quando nao renderiza um <button> nativo,
        aplica role="button" por padrao (inclusive com nativeButton={false}
        — a flag so troca QUAL aviso ele reclama, nao evita a sobrescrita de
        role). Aplicar buttonVariants direto no Link da a mesma aparencia
        sem essa troca de semantica. */}
        <Link
          to={`/contas/${contaDoRecibo}`}
          className={buttonVariants({
            variant: "outline",
            className:
              "gap-2 rounded-full border-2 border-[var(--marca-2)] px-6 font-medium text-[var(--marca-2)] hover:bg-[var(--marca-suave)]",
          })}
        >
          {/* aria-hidden: o texto ao lado ja diz para onde leva. */}
          <ReceiptText aria-hidden="true" className="size-4" />
          {t("transaction:backToStatement")}
        </Link>
      </div>
    </div>
  );
}
