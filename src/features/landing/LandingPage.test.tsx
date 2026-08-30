import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import LandingPage from "@/features/landing/LandingPage";
import i18n from "@/app/i18n";

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
});

function montar() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe("landing page", () => {
  it("o botao de demo leva ao login", () => {
    montar();

    // Sao dois (topo e rodape) e ambos precisam apontar para o mesmo lugar:
    // a landing so cumpre seu papel se o visitante conseguir entrar no app.
    const botoes = screen.getAllByRole("link", { name: "Acessar Demo" });
    expect(botoes.length).toBeGreaterThan(0);
    for (const botao of botoes) {
      expect(botao).toHaveAttribute("href", "/login");
    }
  });

  it("o menu mobile abre e fecha", async () => {
    // O hamburguer do mockup precisa abrir alguma coisa. Abaixo de md a
    // navegacao por secoes so existe por ele.
    montar();
    const usuario = userEvent.setup();
    const botao = screen.getByRole("button", { name: "Abrir menu" });

    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryAllByRole("link", { name: "Arquitetura" })).toHaveLength(1);

    await usuario.click(botao);

    expect(botao).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryAllByRole("link", { name: "Arquitetura" })).toHaveLength(2);

    await usuario.click(botao);

    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryAllByRole("link", { name: "Arquitetura" })).toHaveLength(1);
  });
});
