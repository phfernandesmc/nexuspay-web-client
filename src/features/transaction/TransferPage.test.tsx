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
  number: "12345678",
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

async function escolherOrigem(usuario: ReturnType<typeof userEvent.setup>) {
  // Escopado ao select de origem: antes de uma origem ser escolhida, o
  // destino tambem lista "Principal" entre as contas proprias (nada foi
  // excluido ainda), entao um findByRole global neste nome fica ambiguo.
  const origem = screen.getByLabelText("Conta de origem");
  await within(origem).findByRole("option", { name: /Principal/ });
  await usuario.selectOptions(origem, conta.id);
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
    await screen.findByRole("option", { name: /Maria/ });
    await usuario.selectOptions(screen.getByLabelText("Destino"), contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

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
    await usuario.type(screen.getByLabelText("Número da conta"), "99999999");
    await usuario.click(screen.getByRole("button", { name: "Buscar" }));

    expect(await screen.findByText("J**** P****")).toBeInTheDocument();
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

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
    await screen.findByRole("option", { name: /Maria/ });
    await usuario.selectOptions(screen.getByLabelText("Destino"), contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "999999.00");

    expect(
      await screen.findByText(
        "O valor é maior que o disponível calculado. Você pode enviar mesmo assim — quem decide é o servidor.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();
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
    await screen.findByRole("option", { name: /Maria/ });
    await usuario.selectOptions(screen.getByLabelText("Destino"), contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

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
    await screen.findByRole("option", { name: /Maria/ });
    await usuario.selectOptions(screen.getByLabelText("Destino"), contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

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
    await screen.findByRole("option", { name: /Maria/ });
    await usuario.selectOptions(screen.getByLabelText("Destino"), contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");

    await usuario.click(screen.getByRole("button", { name: "Enviar" }));
    await screen.findByRole("alert");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

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
    await screen.findByRole("option", { name: /Maria/ });
    await usuario.selectOptions(screen.getByLabelText("Destino"), contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));
    await screen.findByRole("alert");

    await usuario.clear(screen.getByLabelText("Valor"));
    await usuario.type(screen.getByLabelText("Valor"), "200.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

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
    await screen.findByRole("option", { name: /Maria/ });
    await usuario.selectOptions(screen.getByLabelText("Destino"), contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));
    await screen.findByRole("alert");

    // So ACRESCENTA o espaco no fim, sem apagar nada: o valor aparado
    // ("100.00") e identico antes e depois. Limpar o campo para redigitar
    // regeraria a chave por causa dos estados INTERMEDIARIOS (o hook gera
    // uma chave nova a cada mudanca de assinatura, mesmo que ela volte a
    // coincidir por acaso depois) — o que provaria outra coisa, nao a
    // estabilidade da chave.
    await usuario.type(screen.getByLabelText("Valor"), " ");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

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
    expect(await screen.findByText(/400,00/)).toBeInTheDocument();
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

    await screen.findByRole("option", { name: /Maria/ });
    await usuario.selectOptions(screen.getByLabelText("Destino"), contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(buscasDestino).toBeGreaterThan(antes));
  });

  it("transfere para uma conta propria sem passar pelo lookup", async () => {
    let usouLookup = false;
    let corpo: unknown = null;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([conta, outraConta])),
      mswHttp.post(`${URL_TESTE}/contacts/lookup`, () => {
        usouLookup = true;
        return HttpResponse.json({});
      }),
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, async ({ request }) => {
        corpo = await request.json();
        return respostaTransacao(202);
      }),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    // Escopado ao select de destino: "Reserva" tambem aparece no select de
    // origem (a lista completa, sem filtro), entao um findByRole global
    // neste nome fica ambiguo.
    const destinoParaEnvio = screen.getByLabelText("Destino");
    await within(destinoParaEnvio).findByRole("option", { name: /Reserva/ });
    await usuario.selectOptions(destinoParaEnvio, "conta-2");
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() =>
      expect(corpo).toEqual({
        source_account_id: conta.id,
        destination_account_id: "conta-2",
        amount: "100.00",
      }),
    );
    // Conta propria nao precisa de busca: o id ja estava na tela.
    expect(usouLookup).toBe(false);
  });

  it("a conta escolhida como origem NAO aparece entre os destinos", async () => {
    // Mandar para a mesma conta e recusado pelo gateway com
    // SAME_ACCOUNT_TRANSFER. Tirar a origem da lista elimina o erro por
    // construcao, em vez de deixa-lo acontecer e traduzir a recusa.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([conta, outraConta])),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);

    const destino = screen.getByLabelText("Destino");
    await within(destino).findByRole("option", { name: /Reserva/ });
    expect(
      within(destino).queryByRole("option", { name: /Principal/ }),
    ).not.toBeInTheDocument();
  });

  it("trocar a origem devolve a conta anterior a lista de destinos", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([conta, outraConta])),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    const destino = screen.getByLabelText("Destino");
    await within(destino).findByRole("option", { name: /Reserva/ });

    await usuario.selectOptions(screen.getByLabelText("Conta de origem"), "conta-2");

    expect(within(destino).getByRole("option", { name: /Principal/ })).toBeInTheDocument();
    expect(
      within(destino).queryByRole("option", { name: /Reserva/ }),
    ).not.toBeInTheDocument();
  });

  it("trocar a origem para a conta que era o destino limpa o destino, sem habilitar Enviar so com um valor", async () => {
    // Round de correcao 1: o <option> do destino some do DOM quando a
    // origem muda para a mesma conta, mas o ESTADO React (contatoId) nao se
    // limpa sozinho. Sem este teste, o botao ficaria habilitavel com um
    // destino fantasma == origem, e o envio bateria em SAME_ACCOUNT_TRANSFER
    // por uma porta diferente da que o filtro deveria fechar.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([conta, outraConta])),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    const destino = screen.getByLabelText("Destino");
    await within(destino).findByRole("option", { name: /Reserva/ });
    await usuario.selectOptions(destino, "conta-2");

    // Troca a origem PARA a conta que estava escolhida como destino.
    await usuario.selectOptions(screen.getByLabelText("Conta de origem"), "conta-2");

    expect(destino).toHaveValue("");

    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  });

  it("trocar a origem para uma terceira conta preserva o destino ja escolhido", async () => {
    // Contraparte do teste acima: a limpeza precisa ser condicional. Uma
    // limpeza incondicional a cada troca de origem destruiria a escolha do
    // usuario sem motivo — e este teste falha se a correcao virar isso.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json([conta, outraConta, terceiraConta]),
      ),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    const destino = screen.getByLabelText("Destino");
    await within(destino).findByRole("option", { name: /Reserva/ });
    await usuario.selectOptions(destino, "conta-2");

    // Troca a origem para uma conta QUE NAO E o destino escolhido.
    await usuario.selectOptions(screen.getByLabelText("Conta de origem"), "conta-3");

    expect(destino).toHaveValue("conta-2");
  });
});
