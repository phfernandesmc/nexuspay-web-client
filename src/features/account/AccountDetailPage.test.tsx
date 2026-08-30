import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import AccountDetailPage from "@/features/account/AccountDetailPage";
import i18n from "@/app/i18n";

const instituicao = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  code: "001",
  name: "Banco Um",
  color_hex: "#112233",
};

const conta = {
  id: "cccccccc-0000-0000-0000-000000000001",
  branch: "0001",
  number: "12345678-9",
  alias: "Salario",
  type: "CHECKING" as const,
  balance: "500.00",
  pending_outgoing: "0.00",
  status: "ACTIVE" as const,
  institution: instituicao,
  created_at: "2026-03-09T14:30:00Z",
};

const extratoVazio = { items: [], next_cursor: null };

const contaComPendente = { ...conta, pending_outgoing: "150.55" };

function montar() {
  return envolverComQuery(
    <MemoryRouter initialEntries={[`/contas/${conta.id}`]}>
      <Routes>
        <Route path="/contas/:id" element={<AccountDetailPage />} />
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
  servidor.use(
    mswHttp.get(`${URL_TESTE}/accounts/${conta.id}/statement`, () =>
      HttpResponse.json(extratoVazio),
    ),
  );
});

describe("detalhe da conta", () => {
  it("encerrar conta com saldo mostra a mensagem de saldo", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${conta.id}`, () => HttpResponse.json(conta)),
      mswHttp.delete(`${URL_TESTE}/accounts/${conta.id}`, () =>
        HttpResponse.json(
          { error: { code: "ACCOUNT_HAS_BALANCE", message: "x", details: {} } },
          { status: 422 },
        ),
      ),
    );
    montar();

    await userEvent.click(await screen.findByRole("button", { name: "Encerrar conta" }));
    await userEvent.click(screen.getByRole("button", { name: "Encerrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não é possível encerrar uma conta com saldo.",
    );
  });

  it("cancelar apos erro de saldo e reabrir nao mostra a mensagem sem o usuario ter clicado em nada", async () => {
    // Reproduz o defeito da review final: o dialogo ficava sempre montado e
    // o `if (!aberto) return null` vinha DEPOIS dos useState, entao o erro
    // sobrevivia ao cancelamento. Reabrir mostrava "Nao e possivel encerrar
    // uma conta com saldo" sem nenhuma nova tentativa — uma afirmacao falsa
    // sobre dinheiro se o usuario tiver zerado a conta nesse meio-tempo.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${conta.id}`, () => HttpResponse.json(conta)),
      mswHttp.delete(`${URL_TESTE}/accounts/${conta.id}`, () =>
        HttpResponse.json(
          { error: { code: "ACCOUNT_HAS_BALANCE", message: "x", details: {} } },
          { status: 422 },
        ),
      ),
    );
    montar();

    await userEvent.click(await screen.findByRole("button", { name: "Encerrar conta" }));
    await userEvent.click(screen.getByRole("button", { name: "Encerrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não é possível encerrar uma conta com saldo.",
    );

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await userEvent.click(await screen.findByRole("button", { name: "Encerrar conta" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("encerrar conta com pendencia mostra mensagem DISTINTA da de saldo", async () => {
    // A fatia 2b acrescentou este erro justamente para impedir encerrar
    // conta com dinheiro a caminho. Confundi-lo com o de saldo faria o
    // usuario zerar a conta e continuar sem conseguir encerrar.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${conta.id}`, () => HttpResponse.json(conta)),
      mswHttp.delete(`${URL_TESTE}/accounts/${conta.id}`, () =>
        HttpResponse.json(
          { error: { code: "ACCOUNT_HAS_PENDING_TRANSACTIONS", message: "x", details: {} } },
          { status: 422 },
        ),
      ),
    );
    montar();

    await userEvent.click(await screen.findByRole("button", { name: "Encerrar conta" }));
    await userEvent.click(screen.getByRole("button", { name: "Encerrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não é possível encerrar a conta com transações pendentes.",
    );
  });

  it("renomear atualiza o apelido na tela", async () => {
    let apelido = "Salario";
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${conta.id}`, () =>
        HttpResponse.json({ ...conta, alias: apelido }),
      ),
      mswHttp.patch(`${URL_TESTE}/accounts/${conta.id}`, async ({ request }) => {
        const corpo = (await request.json()) as { alias: string };
        apelido = corpo.alias;
        return HttpResponse.json({ ...conta, alias: apelido });
      }),
    );
    montar();

    await userEvent.click(await screen.findByRole("button", { name: "Renomear" }));
    const campo = screen.getByLabelText("Apelido (opcional)");
    await userEvent.clear(campo);
    await userEvent.type(campo, "Reserva");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Reserva")).toBeInTheDocument();
  });

  it("mostra a linha de processamento quando ha saida pendente", async () => {
    // Unico ponto de integracao do criterio 10 do spec: prova que
    // AccountDetailPage de fato fia `conta.pending_outgoing` para
    // PendingBalanceLine. O fixture padrao deste arquivo tem pendente zero,
    // entao a linha de processamento nunca renderiza nos outros testes desta
    // pagina — trocar a prop por um literal fixo ("0.00") passaria despercebido
    // sem este teste.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${conta.id}`, () =>
        HttpResponse.json(contaComPendente),
      ),
    );
    montar();

    await screen.findByRole("button", { name: "Encerrar conta" });

    // Regex, nao texto exato: dt e dd sao nos irmaos e getNodeText concatena
    // rotulo com valor, o que deixaria uma asserção de texto exato inerte.
    expect(screen.getByText(/150,55/)).toBeInTheDocument();
    // Disponivel = 500,00 (saldo) - 150,55 (pendente) = 349,45.
    expect(screen.getByText(/349,45/)).toBeInTheDocument();
  });

  it("conta de outro usuario diz nao encontrada, nunca sem permissao", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${conta.id}`, () =>
        HttpResponse.json(
          { error: { code: "ACCOUNT_NOT_FOUND", message: "x", details: {} } },
          { status: 404 },
        ),
      ),
    );
    montar();

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Conta não encontrada.");
    expect(alerta.textContent).not.toMatch(/permiss|autoriz/i);
  });

  it("tem um LINK de volta para a lista de contas", async () => {
    // Link, nao botao: ele navega, e precisa de role="link" para leitor de
    // tela e para Ctrl+clique e abrir em nova aba funcionarem.
    //
    // O nome e "Todas as contas", nao "Contas": a barra lateral ja tem um
    // "Contas", e dois links com o mesmo nome na mesma pagina obrigam quem
    // navega por leitor de tela a adivinhar qual e qual.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${conta.id}`, () => HttpResponse.json(conta)),
    );
    montar();

    const voltar = await screen.findByRole("link", { name: "Todas as contas" });
    expect(voltar).toHaveAttribute("href", "/contas");
  });
});
