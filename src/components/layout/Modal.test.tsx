import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "@/components/layout/Modal";

/**
 * Reproduz a condicao real: o pai guarda estado, entao re-renderiza a cada
 * tecla, e passa um aoFechar recriado em cada render. Um modal que devolva
 * o foco ao proprio cartao quando esse callback muda de identidade rouba o
 * foco do campo entre uma tecla e outra.
 */
function Formulario() {
  const [valor, setValor] = useState("");
  return (
    <Modal titulo="Teste" aoFechar={() => {}}>
      <label htmlFor="campo">Campo</label>
      <input id="campo" value={valor} onChange={(e) => setValor(e.target.value)} />
    </Modal>
  );
}

describe("modal", () => {
  it("um campo dentro do modal aceita o texto inteiro", async () => {
    // O sintoma do defeito era um campo que aceitava so o primeiro
    // caractere — e nenhum teste do modal em si acusava, porque so aparece
    // quando alguem digita mais de uma letra.
    render(<Formulario />);

    await userEvent.type(screen.getByLabelText("Campo"), "Ana Maria");

    expect(screen.getByLabelText("Campo")).toHaveValue("Ana Maria");
  });
});
