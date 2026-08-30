import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import OpenAccountDialog from "@/features/account/OpenAccountDialog";
import { useContas } from "@/features/account/queries";
import i18n from "@/app/i18n";

const instituicao = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  code: "001",
  name: "Banco Um",
  color_hex: "#112233",
};

/**
 * Monta a lista junto do dialogo, exatamente como AccountsPage faz na tela
 * real. invalidateQueries so refaz uma consulta que tem observador ativo
 * (o "active" do refetchType default); sem este componente, ["contas"]
 * nunca chegaria a existir no cache do teste e a invalidacao nao teria o
 * que refazer — nao por falha na implementacao, mas porque nada, no teste
 * isolado, estaria olhando para a lista.
 */
function ListaObservada() {
  useContas();
  return null;
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

describe("abrir conta", () => {
  it("cria a conta e REFAZ a lista", async () => {
    // Este e o teste que pega o defeito silencioso da fatia: sem a
    // invalidacao, a conta e criada no servidor e a lista na tela continua
    // sem ela. Nada quebra — so fica errado.
    let listagens = 0;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/institutions`, () => HttpResponse.json([instituicao])),
      mswHttp.get(`${URL_TESTE}/accounts`, () => {
        listagens += 1;
        return HttpResponse.json([]);
      }),
      mswHttp.post(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json({ id: "nova" }, { status: 201 }),
      ),
    );

    envolverComQuery(
      <>
        <ListaObservada />
        <OpenAccountDialog aberto onFechar={() => {}} />
      </>,
    );
    await screen.findByLabelText("Instituição");
    // O <select> ja existe no DOM antes do /institutions responder, entao
    // findByLabelText por si so retorna cedo demais; esperar a option pelo
    // nome garante que a lista de instituicoes ja chegou.
    await screen.findByRole("option", { name: instituicao.name });
    // A montagem de ListaObservada ja dispara uma listagem inicial; guarda
    // esse numero para so contar o que acontece DEPOIS de abrir a conta.
    await waitFor(() => expect(listagens).toBeGreaterThanOrEqual(1));
    const antes = listagens;

    await userEvent.selectOptions(screen.getByLabelText("Instituição"), instituicao.id);
    await userEvent.click(screen.getByRole("button", { name: "Abrir" }));

    await waitFor(() => expect(listagens).toBeGreaterThan(antes));
  });

  it("limite de contas mostra a mensagem propria", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/institutions`, () => HttpResponse.json([instituicao])),
      mswHttp.post(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json(
          { error: { code: "ACCOUNT_LIMIT_REACHED", message: "x", details: { limit: 10 } } },
          { status: 422 },
        ),
      ),
    );

    envolverComQuery(<OpenAccountDialog aberto onFechar={() => {}} />);
    await screen.findByLabelText("Instituição");
    await screen.findByRole("option", { name: instituicao.name });
    await userEvent.selectOptions(screen.getByLabelText("Instituição"), instituicao.id);
    await userEvent.click(screen.getByRole("button", { name: "Abrir" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Você atingiu o limite de contas ativas.",
    );
  });

  it("instituicao inexistente mostra a mensagem propria", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/institutions`, () => HttpResponse.json([instituicao])),
      mswHttp.post(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json(
          { error: { code: "INSTITUTION_NOT_FOUND", message: "x", details: {} } },
          { status: 404 },
        ),
      ),
    );

    envolverComQuery(<OpenAccountDialog aberto onFechar={() => {}} />);
    await screen.findByLabelText("Instituição");
    await screen.findByRole("option", { name: instituicao.name });
    await userEvent.selectOptions(screen.getByLabelText("Instituição"), instituicao.id);
    await userEvent.click(screen.getByRole("button", { name: "Abrir" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Instituição não encontrada.");
  });

  it("Escape fecha o dialogo", async () => {
    // Virou modal de verdade: sobreposicao cobrindo a pagina. Um modal que
    // nao fecha por Escape prende quem navega so por teclado, porque o
    // botao Cancelar pode estar fora da ordem de foco alcancavel.
    let fechou = false;
    envolverComQuery(<OpenAccountDialog aberto onFechar={() => { fechou = true; }} />);

    await userEvent.keyboard("{Escape}");

    expect(fechou).toBe(true);
  });
});
