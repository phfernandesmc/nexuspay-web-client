import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import TransactionReceiptPage from "@/features/transaction/TransactionReceiptPage";
import i18n from "@/app/i18n";

function transacao(extras: Record<string, unknown> = {}) {
  return {
    id: "tx-1",
    type: "TRANSFER",
    status: "PENDING",
    amount: "150.00",
    source_account_id: "conta-origem",
    destination_account_id: "conta-destino",
    failure_reason: null,
    created_at: "2026-03-09T14:30:00Z",
    ...extras,
  };
}

function montar(estado: { criadaAgora?: boolean } | null = null) {
  return envolverComQuery(
    <MemoryRouter initialEntries={[{ pathname: "/transacoes/tx-1", state: estado }]}>
      <Routes>
        <Route path="/transacoes/:id" element={<TransactionReceiptPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * Expoe o location.state ATUAL (nao o inicial) para o teste conferir que a
 * limpeza aconteceu. Precisa estar na mesma rota que o recibo — um irmao
 * dele, nao um filho — porque useLocation() le o state da entrada de
 * historico corrente, e o teste quer ver esse valor mudar depois do mount,
 * nao o valor capturado uma vez.
 */
function EspiaoDeEstado() {
  const local = useLocation();
  return <span data-testid="estado-state">{JSON.stringify(local.state)}</span>;
}

function montarComEspiaoDeEstado(estado: { criadaAgora?: boolean } | null) {
  return envolverComQuery(
    <MemoryRouter initialEntries={[{ pathname: "/transacoes/tx-1", state: estado }]}>
      <Routes>
        <Route
          path="/transacoes/:id"
          element={
            <>
              <TransactionReceiptPage />
              <EspiaoDeEstado />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
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
});

describe("recibo", () => {
  it("diz que PENDING ainda nao concluiu, com todas as letras", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () => HttpResponse.json(transacao())),
    );

    montar();

    // O valor da situacao e irmao de texto do rotulo ("Situação: Aceita,
    // ainda não concluída") dentro do mesmo <p> — getNodeText concatena os
    // dois, entao nenhum elemento tem so o valor isolado. Regex de
    // substring resolve sem mexer na producao.
    expect(await screen.findByText(/Aceita, ainda não concluída/)).toBeInTheDocument();
    expect(
      screen.getByText("O pedido foi aceito e está sendo processado. O dinheiro ainda não saiu."),
    ).toBeInTheDocument();
  });

  it("distingue a criada agora (202) da reapresentada (200)", async () => {
    // Esta e a razao do RespostaTransacao carregar o status: sem isso, um
    // reenvio diria "enviado agora" sem ter enviado nada.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () => HttpResponse.json(transacao())),
    );

    const { unmount } = montar({ criadaAgora: true });
    expect(await screen.findByText("Pedido enviado agora.")).toBeInTheDocument();
    unmount();

    montar({ criadaAgora: false });
    expect(
      await screen.findByText(
        "Este pedido já tinha sido enviado. Você está vendo a mesma transação, não uma nova.",
      ),
    ).toBeInTheDocument();
  });

  it("captura o estado da navegacao no mount e limpa a entrada do historico em seguida", async () => {
    // Isto NAO testa o reload em si — o jsdom nunca reproduz um F5 de
    // verdade, entao nao ha como flagrar aqui que history.state sobrevive a
    // um recarregamento real (so o e2e contra o Chromium prova isso). O que
    // da para testar e o MECANISMO que precisa rodar para o reload real
    // funcionar: (1) o aviso aparece na montagem, provando que a captura do
    // state funcionou; e (2) location.state fica null logo depois, provando
    // que a limpeza (navigate replace) rodou. Sem as duas metades, um F5 de
    // verdade continuaria mostrando "enviado agora" para sempre — e essa e
    // a unica rede de seguranca disto que roda em `npm test`, sem precisar
    // do gateway, do Postgres nem do Playwright.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () => HttpResponse.json(transacao())),
    );

    montarComEspiaoDeEstado({ criadaAgora: true });

    expect(await screen.findByText("Pedido enviado agora.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("estado-state")).toHaveTextContent("null"),
    );
  });

  it("sem estado de navegacao NAO afirma nada sobre novidade", async () => {
    // E o caso do recarregamento: a chave de idempotencia morreu, o estado
    // da navegacao tambem. Dizer "enviada agora" aqui seria mentira.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () => HttpResponse.json(transacao())),
    );

    montar(null);

    await screen.findByText(/Aceita, ainda não concluída/);
    expect(screen.queryByText("Pedido enviado agora.")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Este pedido já tinha sido enviado. Você está vendo a mesma transação, não uma nova.",
      ),
    ).not.toBeInTheDocument();
  });

  it("o botao de atualizar busca o estado atual, sem timer", async () => {
    let status = "PENDING";
    let buscas = 0;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () => {
        buscas += 1;
        return HttpResponse.json(transacao({ status }));
      }),
    );

    montar();
    await screen.findByText(/Aceita, ainda não concluída/);
    const antes = buscas;

    status = "COMPLETED";
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Atualizar situação" }));

    expect(await screen.findByText(/Concluída/)).toBeInTheDocument();
    expect(buscas).toBeGreaterThan(antes);
  });

  it("comprovante de DEPOSIT linka para a conta de destino, nunca um beco sem saida", async () => {
    // Em DEPOSIT source_account_id e sempre null: o dinheiro nao sai de
    // conta nenhuma. Um botao condicionado a source_account_id deixaria todo
    // deposito sem caminho de volta ao extrato.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () =>
        HttpResponse.json(
          transacao({
            type: "DEPOSIT",
            source_account_id: null,
            destination_account_id: "conta-que-recebeu",
          }),
        ),
      ),
    );

    montar();

    const link = await screen.findByRole("link", { name: "Ver o extrato" });
    expect(link).toHaveAttribute("href", "/contas/conta-que-recebeu");
  });

  it("traduz o motivo da falha POR CODIGO", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () =>
        HttpResponse.json(
          transacao({ status: "FAILED", failure_reason: "DESTINATION_ACCOUNT_UNAVAILABLE" }),
        ),
      ),
    );

    montar();

    expect(
      await screen.findByText(
        i18n.t("DESTINATION_ACCOUNT_UNAVAILABLE", { ns: "errors" }),
      ),
    ).toBeInTheDocument();
  });

  it("motivo desconhecido NAO vaza para a tela", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () =>
        HttpResponse.json(
          transacao({ status: "FAILED", failure_reason: "ALGO_QUE_O_WORKER_INVENTOU" }),
        ),
      ),
    );

    montar();

    await screen.findByText(/Não concluída/);
    expect(screen.queryByText(/ALGO_QUE_O_WORKER_INVENTOU/)).not.toBeInTheDocument();
    expect(screen.getByText(i18n.t("UNKNOWN", { ns: "errors" }))).toBeInTheDocument();
  });

  it("formata o valor em BRL mesmo em ingles", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () => HttpResponse.json(transacao())),
    );

    await i18n.changeLanguage("en");
    montar();

    const valor = await screen.findByText(/150/);
    expect(valor).toHaveTextContent("R$");
    expect(valor.textContent).not.toMatch(/(?<!R)\$/);
  });

  it("oferece salvar o contato quando o destino veio de busca", async () => {
    let corpo: unknown = null;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () => HttpResponse.json(transacao())),
      mswHttp.post(`${URL_TESTE}/contacts`, async ({ request }) => {
        corpo = await request.json();
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    envolverComQuery(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/transacoes/tx-1",
            state: { criadaAgora: true, destinoNaoSalvo: "conta-nova" },
          },
        ]}
      >
        <Routes>
          <Route path="/transacoes/:id" element={<TransactionReceiptPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const usuario = userEvent.setup();
    await usuario.click(
      await screen.findByRole("button", { name: "Salvar destino como contato" }),
    );
    // Espacos nas pontas provam o .trim() do lado da producao: se ele
    // sumisse, o corpo chegaria com "  Joao  " e a asserção abaixo falharia.
    await usuario.type(await screen.findByLabelText("Apelido"), "  Joao  ");
    await usuario.click(screen.getByRole("button", { name: "Salvar contato" }));

    await waitFor(() =>
      expect(corpo).toEqual({ account_id: "conta-nova", alias: "Joao", is_favorite: false }),
    );
  });

  it("a oferta some depois de salvar o contato com sucesso", async () => {
    // Sem limpar o estado depois do sucesso, o botao e o formulario
    // voltariam a aparecer com o mesmo destino ja salvo, e um segundo envio
    // bateria em CONTACT_ALREADY_EXISTS por fazer exatamente o que a tela
    // ofereceu.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () => HttpResponse.json(transacao())),
      mswHttp.post(`${URL_TESTE}/contacts`, () => HttpResponse.json({}, { status: 201 })),
    );

    envolverComQuery(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/transacoes/tx-1",
            state: { criadaAgora: true, destinoNaoSalvo: "conta-nova" },
          },
        ]}
      >
        <Routes>
          <Route path="/transacoes/:id" element={<TransactionReceiptPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const usuario = userEvent.setup();
    await usuario.click(
      await screen.findByRole("button", { name: "Salvar destino como contato" }),
    );
    await usuario.type(await screen.findByLabelText("Apelido"), "Joao");
    await usuario.click(screen.getByRole("button", { name: "Salvar contato" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Salvar destino como contato" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByLabelText("Apelido")).not.toBeInTheDocument();
  });

  it("quando salvar o contato falha, o formulario e o botao continuam disponiveis", async () => {
    // Se contatoSalvo fosse setado antes da confirmacao do servidor (versao
    // otimista), este teste tem que acusar: a oferta sumiria mesmo com o
    // salvamento tendo falhado, e o usuario ficaria sem formulario e sem
    // entender por que o contato nao foi salvo.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () => HttpResponse.json(transacao())),
      mswHttp.post(`${URL_TESTE}/contacts`, () =>
        HttpResponse.json(
          {
            error: {
              code: "CONTACT_ALREADY_EXISTS",
              message: "mensagem crua do servidor, nunca deveria aparecer",
              details: {},
            },
          },
          { status: 409 },
        ),
      ),
    );

    envolverComQuery(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/transacoes/tx-1",
            state: { criadaAgora: true, destinoNaoSalvo: "conta-nova" },
          },
        ]}
      >
        <Routes>
          <Route path="/transacoes/:id" element={<TransactionReceiptPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const usuario = userEvent.setup();
    await usuario.click(
      await screen.findByRole("button", { name: "Salvar destino como contato" }),
    );
    await usuario.type(await screen.findByLabelText("Apelido"), "Joao");
    await usuario.click(screen.getByRole("button", { name: "Salvar contato" }));

    // 1. Alerta traduzido POR CODIGO, nunca com a mensagem do servidor.
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(i18n.t("CONTACT_ALREADY_EXISTS", { ns: "errors" }));
    expect(alerta).not.toHaveTextContent("mensagem crua do servidor");

    // 2. O formulario continua na tela — o usuario precisa poder tentar de novo.
    expect(screen.getByLabelText("Apelido")).toBeInTheDocument();

    // 3. O botao de salvar nao sumiu.
    expect(screen.getByRole("button", { name: "Salvar contato" })).toBeInTheDocument();
  });

  it("comprovante de DEPOSIT nao oferece salvar contato", async () => {
    // Hoje isso e seguro por construcao — DepositPage nunca poe
    // destinoNaoSalvo no estado da navegacao — mas nada do lado do recibo
    // afirmava isso ate este teste existir.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () =>
        HttpResponse.json(
          transacao({
            type: "DEPOSIT",
            source_account_id: null,
            destination_account_id: "conta-que-recebeu",
          }),
        ),
      ),
    );

    montar({ criadaAgora: true });

    await screen.findByText("Pedido enviado agora.");
    expect(
      screen.queryByRole("button", { name: "Salvar destino como contato" }),
    ).not.toBeInTheDocument();
  });

  it("NAO oferece salvar quando o destino ja era um contato", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () => HttpResponse.json(transacao())),
    );

    montar({ criadaAgora: true });

    // Mesmo problema de getNodeText documentado no primeiro teste deste
    // arquivo: rotulo e valor sao irmaos de texto no mesmo <p>, entao a
    // string exata nao bate — regex de substring resolve.
    await screen.findByText(/Aceita, ainda não concluída/);
    expect(
      screen.queryByRole("button", { name: "Salvar destino como contato" }),
    ).not.toBeInTheDocument();
  });


  it.each(["COMPLETED", "FAILED"])(
    "nao mostra o botao de atualizar quando a transacao esta %s",
    async (status) => {
      // COMPLETED e FAILED sao terminais: o worker nao volta atras. Um botao
      // de atualizar ali sugere que a resposta ainda pode mudar, e nao pode.
      servidor.use(
        mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () =>
          HttpResponse.json(transacao({ status, failure_reason: null })),
        ),
      );
      montar();
      await screen.findByText(/R\$/);

      expect(screen.queryByRole("button", { name: /Atualizar/ })).toBeNull();
    },
  );

  it("atualizar entra em espera depois do clique", async () => {
    // O cooldown NAO protege contra bot — bot nao usa a interface, e quem o
    // barra e o rate limit do gateway (60/minuto). Ele existe para quem esta
    // ansioso nao martelar o botao e levar um 429 na propria cara.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () =>
        HttpResponse.json(transacao({ status: "PENDING" })),
      ),
    );
    montar();
    const usuario = userEvent.setup();
    const botao = await screen.findByRole("button", { name: /Atualizar/ });

    await usuario.click(botao);

    expect(await screen.findByRole("button", { name: /\ds/ })).toBeDisabled();
  });

  it("voltar ao extrato e um LINK, nao um botao", async () => {
    // O codigo tem um comentario longo explicando isto, e comentario nao
    // impede ninguem de "padronizar" os botoes da tela. Este controle
    // NAVEGA: precisa de role="link" para leitor de tela e para Ctrl+clique
    // e abrir em nova aba funcionarem. Trocado por <Button>, tudo continua
    // parecendo certo na tela e some para quem nao usa mouse.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () =>
        HttpResponse.json(transacao({ status: "COMPLETED", failure_reason: null })),
      ),
    );
    montar();

    const voltar = await screen.findByRole("link", { name: /extrato/i });
    expect(voltar).toHaveAttribute("href");
  });

  it("volta para a tela anterior quando ha historico no app", async () => {
    // Botao, e nao link: "voltar" nao tem URL — vai para a entrada anterior
    // do historico, seja ela qual for. Nao ha o que abrir em nova aba.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () =>
        HttpResponse.json(transacao({ status: "COMPLETED", failure_reason: null })),
      ),
    );
    envolverComQuery(
      <MemoryRouter initialEntries={["/contas/conta-1", "/transacoes/tx-1"]} initialIndex={1}>
        <Routes>
          <Route path="/contas/:id" element={<p>tela anterior</p>} />
          <Route path="/transacoes/:id" element={<TransactionReceiptPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Voltar" }));

    expect(await screen.findByText("tela anterior")).toBeInTheDocument();
  });

  it("NAO mostra voltar quando o recibo foi aberto direto pela URL", async () => {
    // Sem historico no app, voltar levaria a pessoa para FORA dele — a
    // pagina anterior do navegador. Um botao que sai do aplicativo e pior
    // que botao nenhum.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () =>
        HttpResponse.json(transacao({ status: "COMPLETED", failure_reason: null })),
      ),
    );
    montar();
    await screen.findByText(/R\$/);

    expect(screen.queryByRole("button", { name: "Voltar" })).toBeNull();
  });
});
