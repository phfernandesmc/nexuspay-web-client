import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import { useConta } from "@/features/account/queries";
import TransferPage from "@/features/transaction/TransferPage";
import i18n from "@/app/i18n";

const instituicao = { id: "inst-1", code: "001", name: "Banco Um", color_hex: "#112233" };

const conta = {
  id: "conta-1",
  branch: "0001",
  number: "12345678-9",
  alias: "Principal",
  type: "CHECKING",
  balance: "500.00",
  pending_outgoing: "100.00",
  status: "ACTIVE",
  institution: instituicao,
  created_at: "2026-03-01T10:00:00Z",
};

const outraConta = {
  ...conta,
  id: "conta-2",
  number: "99999999",
  alias: "Reserva",
};

const terceiraConta = {
  ...conta,
  id: "conta-3",
  number: "11122233",
  alias: "Viagem",
};

const contato = {
  id: "contato-1",
  alias: "Maria",
  is_favorite: false,
  target_account: {
    id: "conta-maria",
    branch: "0002",
    number: "87654321",
    holder_name: "M**** S****",
    type: "CHECKING",
    status: "ACTIVE",
    institution: instituicao,
  },
  created_at: "2026-03-01T10:00:00Z",
};

/** A mesma conta-maria do contato acima, mas como o gateway a devolve em GET /accounts/:id. */
const contaMaria = {
  id: "conta-maria",
  branch: "0002",
  number: "87654321",
  alias: "Da Maria",
  type: "CHECKING",
  balance: "10.00",
  pending_outgoing: "0.00",
  status: "ACTIVE",
  institution: instituicao,
  created_at: "2026-03-01T10:00:00Z",
};

function Espiao() {
  const local = useLocation();
  const estado = local.state as { destinoNaoSalvo?: string | null } | null;
  return (
    <div>
      <span data-testid="rota">{local.pathname}</span>
      <span data-testid="destino-nao-salvo">{String(estado?.destinoNaoSalvo)}</span>
    </div>
  );
}

/**
 * Mantem CHAVES.conta(id) com observador ativo durante o teste todo, mesmo
 * depois que a transferencia navega para longe da TransferPage.
 * invalidateQueries so refaz consulta com observador ativo (o "active" do
 * refetchType default); sem este componente paralelo, uma corrida entre a
 * navegacao e a invalidacao deixaria o teste instavel em vez de provar a
 * invalidacao de fato. Mesmo padrao de ListaObservada em DepositPage.test.tsx.
 */
function DestinoObservado({ id }: { id: string }) {
  useConta(id);
  return null;
}

function montar() {
  return envolverComQuery(
    <MemoryRouter initialEntries={["/transferir"]}>
      <Routes>
        <Route path="/transferir" element={<TransferPage />} />
        <Route path="/transacoes/:id" element={<Espiao />} />
      </Routes>
    </MemoryRouter>,
  );
}

function respostaTransacao(status: number) {
  return HttpResponse.json(
    {
      id: "tx-1",
      type: "TRANSFER",
      status: "PENDING",
      amount: "100.00",
      source_account_id: conta.id,
      destination_account_id: "conta-maria",
      failure_reason: null,
      created_at: "2026-03-09T14:30:00Z",
    },
    { status },
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({
    accessToken: "tok",
    user: null,
    status: "authenticated",
    motivoEncerramento: null,
  });
  servidor.use(
    mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([conta])),
    mswHttp.get(`${URL_TESTE}/contacts`, () => HttpResponse.json([contato])),
    mswHttp.get(`${URL_TESTE}/institutions`, () => HttpResponse.json([instituicao])),
    mswHttp.get(`${URL_TESTE}/accounts/${conta.id}/statement`, () =>
      HttpResponse.json({ items: [], next_cursor: null }),
    ),
  );
});

type Usuario = ReturnType<typeof userEvent.setup>;

/**
 * As tres interacoes da tela passam por aqui, e as assercoes NAO.
 *
 * A tela vai mudar de forma — carrossel no lugar do select, confirmacao
 * antes de enviar — e sem esta camada cada mudanca visual reescreveria as
 * mesmas 19 provas. Concentrando o caminho, uma mudanca de forma toca um
 * helper; se alguma asserção precisar mudar, e sinal de que o COMPORTAMENTO
 * mudou, e isso merece conversa, nao ajuste.
 */
async function escolherOrigem(usuario: Usuario, id: string = conta.id) {
  // A origem virou um radiogroup de cartoes; o caminho ate ela mudou, as
  // provas nao.
  await usuario.click(await screen.findByTestId(`origem-${id}`));
}

async function escolherDestino(usuario: Usuario, id: string) {
  // O destino virou uma lista clicavel; o caminho mudou, as provas nao.
  await usuario.click(await screen.findByTestId(`destino-${id}`));
}

/** O botao que dispara a transferencia. Usado tambem pelas assercoes de
 *  habilitado/desabilitado, para que renomea-lo nao alcance nenhuma delas. */
function botaoDeEnvio(): HTMLElement {
  // Renomeado para "Continuar" quando a confirmacao entrou: ele abre a
  // revisao em vez de enviar. As assercoes de habilitado/desabilitado
  // continuam valendo sobre ele, sem uma linha alterada.
  return screen.getByRole("button", { name: "Continuar" });
}

async function enviar(usuario: Usuario) {
  await usuario.click(botaoDeEnvio());
  await usuario.click(screen.getByRole("button", { name: "Confirmar" }));
}

describe("transferencia", () => {
  it("transfere para um contato salvo", async () => {
    let corpo: unknown = null;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, async ({ request }) => {
        corpo = await request.json();
        return respostaTransacao(202);
      }),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await screen.findByTestId(`destino-${contato.id}`);
    await escolherDestino(usuario, contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await enviar(usuario);

    await waitFor(() =>
      expect(corpo).toEqual({
        source_account_id: conta.id,
        destination_account_id: "conta-maria",
        amount: "100.00",
      }),
    );
    expect(await screen.findByTestId("rota")).toHaveTextContent("/transacoes/tx-1");
  });

  it("transfere para uma conta buscada na hora, sem salvar contato", async () => {
    let salvouContato = false;
    let corpo: unknown = null;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/contacts`, () => {
        salvouContato = true;
        return HttpResponse.json({}, { status: 201 });
      }),
      mswHttp.post(`${URL_TESTE}/contacts/lookup`, () =>
        HttpResponse.json({
          account_id: "conta-nova",
          holder_name: "J**** P****",
          type: "CHECKING",
          institution: instituicao,
        }),
      ),
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, async ({ request }) => {
        corpo = await request.json();
        return respostaTransacao(202);
      }),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await usuario.click(screen.getByRole("button", { name: "Buscar outra conta" }));

    await screen.findByRole("option", { name: instituicao.name });
    await usuario.selectOptions(screen.getByLabelText("Instituição"), instituicao.id);
    await usuario.type(screen.getByLabelText("Agência"), "0003");
    // Formato real do gateway: ^\\d{8}-\\d$. "99999999" passava porque o MSW
    // responde sem validar — o mock escondia o contrato.
    await usuario.type(screen.getByLabelText("Número da conta"), "99999999-9");
    await usuario.click(screen.getByRole("button", { name: "Buscar" }));

    expect(await screen.findByText("J**** P****")).toBeInTheDocument();
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await enviar(usuario);

    await waitFor(() =>
      expect(corpo).toEqual({
        source_account_id: conta.id,
        destination_account_id: "conta-nova",
        amount: "100.00",
      }),
    );
    // Transferir nao cria contato. O gateway nem liga um ao outro.
    expect(salvouContato).toBe(false);
    // Criterio 8 do spec: a tela precisa de fato por destinoNaoSalvo no
    // estado da navegacao para o recibo poder oferecer "salvar contato".
    // TransactionReceiptPage.test.tsx so prova o que o RECIBO faz com o
    // estado — ele monta a rota ja com { destinoNaoSalvo: "conta-nova" } no
    // MemoryRouter, sem passar pela TransferPage. Esta e a unica prova de
    // que a TELA REAL preenche esse campo.
    expect(await screen.findByTestId("destino-nao-salvo")).toHaveTextContent("conta-nova");
  });

  it("valor acima do disponivel avisa mas NAO desabilita o botao", async () => {
    // O disponivel derivado pode estar MAIOR que o real (furo declarado na
    // secao 6 do spec da 3b). Bloquear no cliente barraria envio legitimo.
    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await screen.findByTestId(`destino-${contato.id}`);
    await escolherDestino(usuario, contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "999999.00");

    expect(
      await screen.findByText(
        "O valor é maior que o disponível calculado. Você pode enviar mesmo assim — quem decide é o servidor.",
      ),
    ).toBeInTheDocument();
    expect(botaoDeEnvio()).toBeEnabled();
  });

  it("saldo insuficiente do servidor aparece traduzido por codigo", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, () =>
        HttpResponse.json(
          {
            error: {
              code: "INSUFFICIENT_FUNDS",
              message: "nao mostre isto",
              details: { available: "50.00" },
            },
          },
          { status: 422 },
        ),
      ),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await screen.findByTestId(`destino-${contato.id}`);
    await escolherDestino(usuario, contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await enviar(usuario);

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(i18n.t("INSUFFICIENT_FUNDS", { ns: "errors" }));
    expect(alerta).not.toHaveTextContent("nao mostre isto");
  });

  it("transferir para a mesma conta mostra a mensagem propria", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, () =>
        HttpResponse.json(
          { error: { code: "SAME_ACCOUNT_TRANSFER", message: "", details: {} } },
          { status: 422 },
        ),
      ),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await screen.findByTestId(`destino-${contato.id}`);
    await escolherDestino(usuario, contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await enviar(usuario);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("SAME_ACCOUNT_TRANSFER", { ns: "errors" }),
    );
  });

  it("reenviar o MESMO pedido usa a MESMA chave; mudar o valor gera outra", async () => {
    // O teste central da idempotencia na tela real: sem isto, um clique
    // duplo depois de uma falha de rede criaria duas transferencias.
    const chaves: string[] = [];
    let falhar = true;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, ({ request }) => {
        chaves.push(request.headers.get("Idempotency-Key") ?? "");
        if (falhar) {
          falhar = false;
          return HttpResponse.error();
        }
        return respostaTransacao(202);
      }),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await screen.findByTestId(`destino-${contato.id}`);
    await escolherDestino(usuario, contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");

    await enviar(usuario);
    await screen.findByRole("alert");
    await enviar(usuario);

    await waitFor(() => expect(chaves).toHaveLength(2));
    expect(chaves[0]).toBe(chaves[1]);
  });

  it("erro ao carregar contas mostra o alerta traduzido e nao afirma 'sem contas' em silencio", async () => {
    // Com GET /accounts em 500, a tela antes renderizava o select vazio
    // sem alerta nenhum — afirmando por omissao que o usuario nao tem
    // contas. Mesmo padrao de AccountsPage.tsx e DepositPage.tsx.
    servidor.use(mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.error()));

    montar();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não conseguimos falar com o servidor. Verifique sua conexão.",
    );
    expect(screen.queryByLabelText("Conta de origem")).not.toBeInTheDocument();
  });

  it("erro ao carregar contatos mostra o alerta traduzido, sem bloquear o resto da tela", async () => {
    // Diferente de useContas, useContatos nao e essencial: "Buscar outra
    // conta" continua funcionando sem a lista de contatos salvos. Por isso o
    // alerta e inline, nao um bloqueio de pagina inteira.
    servidor.use(mswHttp.get(`${URL_TESTE}/contacts`, () => HttpResponse.error()));

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não conseguimos falar com o servidor. Verifique sua conexão.",
    );
    // A tela continua utilizavel: a origem foi escolhida e o botao de busca
    // na hora ainda esta la.
    expect(screen.getByRole("button", { name: "Buscar outra conta" })).toBeInTheDocument();
  });

  it("mudar SO o valor gera uma chave de idempotencia NOVA", async () => {
    // O criterio 15 do spec: a chave precisa estar presa ao valor. O
    // revisor desamarrou amount do payload na tela e a suite inteira ficou
    // verde — a unica prova viva era um teste de hook que nao passa pelo
    // formulario. Este teste falha nesse cenario porque manda o pedido pela
    // TELA de verdade, com um valor diferente entre os dois envios.
    const chaves: string[] = [];
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, ({ request }) => {
        chaves.push(request.headers.get("Idempotency-Key") ?? "");
        // Sempre falha: mantem a tela montada para o segundo envio, com o
        // MESMO formulario que gerou o primeiro.
        return HttpResponse.error();
      }),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await screen.findByTestId(`destino-${contato.id}`);
    await escolherDestino(usuario, contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await enviar(usuario);
    await screen.findByRole("alert");

    await usuario.clear(screen.getByLabelText("Valor"));
    await usuario.type(screen.getByLabelText("Valor"), "200.00");
    await enviar(usuario);

    await waitFor(() => expect(chaves).toHaveLength(2));
    expect(chaves[0]).not.toBe(chaves[1]);
  });

  it("espaco em branco no fim do valor NAO muda a chave de idempotencia", async () => {
    // A assinatura usava `valor` cru, mas o pedido manda `valor.trim()`.
    // Editar so espaco — "100.00 " vira "100.00" — gerava chave NOVA para
    // um payload identico. Um reenvio depois de falha de rede criaria uma
    // SEGUNDA transferencia: o furo que duplica dinheiro, nao o que devolve
    // 409.
    const chaves: string[] = [];
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, ({ request }) => {
        chaves.push(request.headers.get("Idempotency-Key") ?? "");
        return HttpResponse.error();
      }),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await screen.findByTestId(`destino-${contato.id}`);
    await escolherDestino(usuario, contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await enviar(usuario);
    await screen.findByRole("alert");

    // So ACRESCENTA o espaco no fim, sem apagar nada: o valor aparado
    // ("100.00") e identico antes e depois. Limpar o campo para redigitar
    // regeraria a chave por causa dos estados INTERMEDIARIOS (o hook gera
    // uma chave nova a cada mudanca de assinatura, mesmo que ela volte a
    // coincidir por acaso depois) — o que provaria outra coisa, nao a
    // estabilidade da chave.
    await usuario.type(screen.getByLabelText("Valor"), " ");
    await enviar(usuario);

    await waitFor(() => expect(chaves).toHaveLength(2));
    expect(chaves[0]).toBe(chaves[1]);
  });

  it("o disponivel vem da conta, sem consultar o extrato", async () => {
    // Se a tela voltasse a consultar o extrato para descobrir o pendente,
    // este handler seria chamado — e o furo dos 100 itens estaria de volta.
    let consultouExtrato = false;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/:id/statement`, () => {
        consultouExtrato = true;
        return HttpResponse.json({ items: [], next_cursor: null });
      }),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);

    // conta.balance e "500.00" e conta.pending_outgoing e "100.00" no
    // fixture: o disponivel precisa ser 400,00, nao 500,00.
    //
    // Checa os DOIS lugares em que ele aparece — o cartao da conta e a linha
    // abaixo — em vez de um findByText solto, que estoura por ambiguidade
    // desde que o cartao passou a mostrar o saldo. A prova ficou mais
    // especifica, nao mais frouxa: antes bastava o numero existir em algum
    // lugar da tela.
    const cartao = await screen.findByTestId(`origem-${conta.id}`);
    expect(within(cartao).getByText(/400,00/)).toBeInTheDocument();
    expect(screen.getByTestId("disponivel-origem")).toHaveTextContent(/400,00/);
    expect(consultouExtrato).toBe(false);
  });

  it("falha ao carregar contas nao exibe disponivel nenhum", async () => {
    // Criterio 12 do spec. Sem conta nao ha saldo nem pendente, entao nao ha
    // disponivel a mostrar — e mostrar zero seria pior que nao mostrar nada.
    servidor.use(mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.error()));

    montar();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/Dispon/)).not.toBeInTheDocument();
  });

  it("transferencia bem sucedida REFAZ o saldo em cache da conta de destino", async () => {
    // Este e o teste que pega o defeito silencioso: sem invalidar tambem o
    // destination_account_id, duas contas do MESMO usuario ficam
    // dessincronizadas — quem enviou ve o saldo novo, quem recebeu continua
    // com o saldo velho em cache ate a proxima montagem.
    let buscasDestino = 0;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${contaMaria.id}`, () => {
        buscasDestino += 1;
        return HttpResponse.json(contaMaria);
      }),
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, () => respostaTransacao(202)),
    );

    envolverComQuery(
      <>
        <DestinoObservado id={contaMaria.id} />
        <MemoryRouter initialEntries={["/transferir"]}>
          <Routes>
            <Route path="/transferir" element={<TransferPage />} />
            <Route path="/transacoes/:id" element={<Espiao />} />
          </Routes>
        </MemoryRouter>
      </>,
    );
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await waitFor(() => expect(buscasDestino).toBeGreaterThanOrEqual(1));
    const antes = buscasDestino;

    await screen.findByTestId(`destino-${contato.id}`);
    await escolherDestino(usuario, contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await enviar(usuario);

    await waitFor(() => expect(buscasDestino).toBeGreaterThan(antes));
  });

  it("valor acima do disponivel ainda CONCLUI a etapa do valor", async () => {
    // Par do teste que garante que o botao nao e desabilitado. O disponivel
    // do cliente e estimativa; quem decide e o servidor. Um indicador que
    // marcasse esta etapa como pendente diria ao usuario que falta algo
    // quando nao falta.
    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await escolherDestino(usuario, contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "999999.00");

    expect(screen.getByTestId("etapa-valor")).toHaveAttribute("data-concluida", "true");
  });

  it("a origem e um grupo de radio, nao botoes soltos", async () => {
    // Trocar o <select> por cartoes clicaveis perderia navegacao por setas e
    // o anuncio de "selecionado" — uma regressao vestida de melhoria. O
    // radiogroup devolve as duas coisas.
    montar();
    const usuario = userEvent.setup();

    const grupo = await screen.findByRole("radiogroup", { name: "Conta de origem" });
    // findAll, nao getAll: o grupo existe antes de as contas chegarem.
    const opcoes = await within(grupo).findAllByRole("radio");
    expect(opcoes.length).toBeGreaterThan(0);
    expect(opcoes.every((o) => o.getAttribute("aria-checked") === "false")).toBe(true);

    await usuario.click(screen.getByTestId(`origem-${conta.id}`));

    expect(screen.getByTestId(`origem-${conta.id}`)).toHaveAttribute("aria-checked", "true");
  });

  it("abrir e fechar a confirmacao NAO gera chave de idempotencia nova", async () => {
    // O passo novo introduz uma hesitacao possivel: abrir a confirmacao,
    // desistir, reabrir. Se cada abertura regenerasse a chave, a hesitacao
    // viraria transferencia duplicada — exatamente o que a idempotencia
    // existe para impedir.
    const chaves: string[] = [];
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, ({ request }) => {
        chaves.push(request.headers.get("Idempotency-Key") ?? "");
        // Sempre falha, como nos outros testes de chave: o sucesso navega
        // para o comprovante e desmonta a tela, e o segundo envio precisa do
        // MESMO formulario montado.
        return HttpResponse.error();
      }),
    );
    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await screen.findByTestId(`destino-${contato.id}`);
    await escolherDestino(usuario, contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");

    // Abre, desiste, abre de novo, confirma.
    await usuario.click(botaoDeEnvio());
    await usuario.click(screen.getByRole("button", { name: "Cancelar" }));
    await enviar(usuario);

    // Envia de novo sem mexer em nada: a chave tem de ser a mesma, apesar
    // das aberturas a mais.
    await waitFor(() => expect(chaves).toHaveLength(1));
    await enviar(usuario);

    await waitFor(() => expect(chaves).toHaveLength(2));
    expect(chaves[0]).toBe(chaves[1]);
  });

  it("conta com saldo zero nao pode ser escolhida como origem", async () => {
    // Bloqueia pelo BALANCE, que vem do servidor — nao pelo disponivel, que
    // e estimativa do cliente. Uma conta com saldo mas disponivel zerado por
    // pendencias continua selecionavel: a pendencia pode falhar e liberar o
    // valor, e quem decide isso e o gateway.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json([conta, { ...outraConta, balance: "0.00", pending_outgoing: "0.00" }]),
      ),
    );
    montar();
    const usuario = userEvent.setup();

    const vazia = await screen.findByTestId(`origem-${outraConta.id}`);
    expect(vazia).toHaveAttribute("aria-disabled", "true");

    await usuario.click(vazia);

    expect(vazia).toHaveAttribute("aria-checked", "false");
  });

  it("conta com saldo mas disponivel zerado por pendencia CONTINUA escolhivel", async () => {
    // O par do teste acima: o cliente nao decide que a transferencia e
    // impossivel usando a propria estimativa.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json([{ ...conta, balance: "100.00", pending_outgoing: "100.00" }]),
      ),
    );
    montar();
    const usuario = userEvent.setup();

    const comPendencia = await screen.findByTestId(`origem-${conta.id}`);
    await usuario.click(comPendencia);

    expect(comPendencia).toHaveAttribute("aria-checked", "true");
  });

  it("a seta pula a conta sem saldo em vez de parar nela", async () => {
    // Sem isto, quem navega so por teclado fica preso numa opcao que nao
    // pode escolher — o bloqueio viraria um beco sem saida.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json([
          conta,
          { ...outraConta, balance: "0.00", pending_outgoing: "0.00" },
          terceiraConta,
        ]),
      ),
    );
    montar();
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByTestId(`origem-${conta.id}`));
    await usuario.keyboard("{ArrowRight}");

    // Pula a do meio (sem saldo) e chega na terceira.
    expect(screen.getByTestId(`origem-${terceiraConta.id}`)).toHaveAttribute(
      "aria-checked", "true");
  });

  it("os favoritos aparecem como sugestao e escolhem o destino num clique", async () => {
    // Sugerido = favorito. Nao inventa um criterio proprio de "mais usado",
    // que exigiria dado que o gateway nao expoe; usa o que o usuario ja
    // marcou.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/contacts`, () =>
        HttpResponse.json([
          { ...contato, id: "c-fav", alias: "Ana", is_favorite: true },
          { ...contato, id: "c-comum", alias: "Bruno", is_favorite: false },
        ]),
      ),
    );
    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);

    const sugestoes = await screen.findByTestId("sugestoes");
    expect(within(sugestoes).getByRole("button", { name: /Ana/ })).toBeInTheDocument();
    expect(within(sugestoes).queryByRole("button", { name: /Bruno/ })).toBeNull();

    await usuario.click(within(sugestoes).getByRole("button", { name: /Ana/ }));

    // O destino nao tem mais um <select> com value; o que se observa e o
    // contato marcado na lista. O comportamento provado e o mesmo: clicar
    // no sugerido escolhe aquele destino.
    expect(screen.getByTestId("destino-c-fav")).toHaveAttribute("aria-checked", "true");
  });

  it("a busca filtra os contatos por apelido e por titular", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/contacts`, () =>
        HttpResponse.json([
          { ...contato, id: "c-ana", alias: "Ana" },
          { ...contato, id: "c-bruno", alias: "Bruno" },
        ]),
      ),
    );
    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await screen.findByTestId("destino-c-ana");

    await usuario.type(screen.getByLabelText("Buscar contato"), "bru");

    expect(screen.queryByTestId("destino-c-ana")).toBeNull();
    expect(screen.getByTestId("destino-c-bruno")).toBeInTheDocument();
  });

  it("trocar a origem preserva o destino ja escolhido", async () => {
    // Sobrevivente das regras cruzadas: o destino so lista contatos, e um
    // contato nunca e conta propria, entao trocar a origem nunca precisa
    // limpar o destino. O que este teste guarda e que a troca tambem nao
    // limpe por engano — perder o destinatario ja escolhido no meio do
    // preenchimento seria silencioso.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([conta, terceiraConta])),
    );
    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await screen.findByTestId(`destino-${contato.id}`);
    await escolherDestino(usuario, contato.id);

    await escolherOrigem(usuario, terceiraConta.id);

    expect(screen.getByTestId(`destino-${contato.id}`)).toHaveAttribute(
      "aria-checked", "true");
  });

  it("cancelar a insercao manual volta para a escolha por contato", async () => {
    // Sem isto, abrir a busca manual e um caminho so de ida: quem clicou por
    // engano fica com o formulario de agencia e numero aberto e nenhuma
    // forma de voltar aos contatos sem recarregar a pagina.
    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await usuario.click(screen.getByRole("button", { name: "Buscar outra conta" }));

    expect(screen.getByLabelText("Agência")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByLabelText("Agência")).toBeNull();
    expect(screen.getByRole("button", { name: "Buscar outra conta" })).toBeInTheDocument();
  });
});
