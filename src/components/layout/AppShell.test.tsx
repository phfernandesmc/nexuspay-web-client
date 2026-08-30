import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import AppShell from "@/components/layout/AppShell";
import { useSession } from "@/features/auth/session.store";
import i18n from "@/app/i18n";

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({
    accessToken: "tok",
    user: {
      id: "11111111-1111-1111-1111-111111111111",
      full_name: "Joao Silva",
      email: "joao@example.com",
      document: "39053344705",
      created_at: "2026-08-12T00:00:00Z",
    },
    status: "authenticated",
    motivoEncerramento: null,
    sessaoEncerrada: false,
  });
});

function montar() {
  return render(
    <MemoryRouter>
      <AppShell>
        <p>conteudo</p>
      </AppShell>
    </MemoryRouter>,
  );
}

describe("estrutura do app", () => {
  it("o menu mobile abre e fecha", async () => {
    // Ate aqui a barra lateral era `hidden md:block` SEM substituto: abaixo
    // de 768px o app ficava sem navegacao nenhuma. Este teste existe para
    // que ela nao volte a sumir.
    montar();
    const usuario = userEvent.setup();
    const botao = screen.getByRole("button", { name: "Abrir menu" });

    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("link", { name: "Contas" })).toHaveLength(1);

    await usuario.click(botao);

    expect(botao).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("link", { name: "Contas" })).toHaveLength(2);

    await usuario.click(botao);

    expect(screen.getAllByRole("link", { name: "Contas" })).toHaveLength(1);
  });

  it("o menu da conta revela quem esta logado e o sair", async () => {
    // O que justifica o menu existir: o e-mail da sessao nao aparece em
    // nenhum outro lugar do app. Um menu suspenso com um item so seria
    // cerimonia; com a identificacao da sessao, ele informa algo.
    montar();
    const usuario = userEvent.setup();

    expect(screen.queryByText("joao@example.com")).toBeNull();

    await usuario.click(screen.getByRole("button", { name: /Joao Silva/ }));

    expect(await screen.findByText("joao@example.com")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Sair" })).toBeInTheDocument();
  });

  it("troca o idioma pelo alternador PT/EN", async () => {
    montar();
    const usuario = userEvent.setup();

    await usuario.click(screen.getByRole("button", { name: "EN" }));

    expect(i18n.resolvedLanguage).toBe("en");
  });
});
