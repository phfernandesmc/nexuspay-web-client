import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import InstitutionLogo from "@/features/institution/InstitutionLogo";

const nubank = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  code: "NUBANK",
  name: "Nubank",
  color_hex: "#820AD1",
};

const itau = { ...nubank, code: "ITAU", name: "Itau Unibanco", color_hex: "#EC7000" };

describe("logo da instituicao", () => {
  it("mostra o logo do banco quando o codigo tem arquivo", () => {
    render(<InstitutionLogo instituicao={nubank} />);

    // Nao se afirma nada sobre o src: o Vite embute SVG abaixo de 4KB como
    // data: URI, entao o nome do arquivo some da URL em quatro dos seis
    // bancos. O que importa e existir uma imagem com o nome acessivel do
    // banco — o monograma nao tem role "img".
    expect(screen.getByRole("img", { name: "Nubank" })).toBeInTheDocument();
  });

  it("da logos diferentes para bancos diferentes", () => {
    // Este e o que pega o erro real do mapa: uma linha copiada e colada em
    // LOGOS apontando dois codigos para o mesmo import passa despercebida
    // pelo teste acima, porque ele so exige que exista alguma imagem.
    const { unmount } = render(<InstitutionLogo instituicao={nubank} />);
    const primeiro = screen.getByRole("img").getAttribute("src");
    unmount();

    render(<InstitutionLogo instituicao={itau} />);
    const segundo = screen.getByRole("img").getAttribute("src");

    expect(primeiro).not.toBe(segundo);
  });

  /**
   * As instituicoes nascem de migration, nao do front. Uma migration futura
   * pode inserir um banco sem que exista SVG para ele, e o card nao pode
   * quebrar nem mostrar imagem vazia por causa disso. O monograma e o que
   * garante que a tela continua inteira — e e por isso que os testes que ja
   * existem, todos com code "001", seguem verdes.
   */
  it("cai para o monograma quando o codigo nao tem arquivo", () => {
    render(
      <InstitutionLogo instituicao={{ ...nubank, code: "001", name: "Banco Um" }} />,
    );

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("B")).toBeInTheDocument();
  });
});
