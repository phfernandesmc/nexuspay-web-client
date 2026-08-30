import { describe, it, expect, beforeEach, vi } from "vitest";
import { CHAVE_TEMA, escolherTema, ligarTema, temaInicial } from "@/lib/tema";

function fingirDispositivo(prefereEscuro: boolean) {
  vi.stubGlobal("matchMedia", (consulta: string) => ({
    matches: prefereEscuro && consulta.includes("dark"),
    media: consulta,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  vi.unstubAllGlobals();
});

describe("tema", () => {
  it("sem escolha salva, segue a preferencia do dispositivo", () => {
    fingirDispositivo(true);
    expect(temaInicial()).toBe("dark");

    fingirDispositivo(false);
    expect(temaInicial()).toBe("light");
  });

  it("a escolha salva vence a preferencia do dispositivo", () => {
    // Quem trocou no app disse o que quer. O sistema so decide enquanto
    // ninguem decidiu.
    fingirDispositivo(true);
    localStorage.setItem(CHAVE_TEMA, "light");

    expect(temaInicial()).toBe("light");
  });

  it("escolher liga a classe E persiste", () => {
    escolherTema("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(CHAVE_TEMA)).toBe("dark");

    escolherTema("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(CHAVE_TEMA)).toBe("light");
  });

  it("ligar NAO persiste", () => {
    // O boot usa esta. Se ela gravasse, a preferencia do DISPOSITIVO viraria
    // uma escolha do usuario, e trocar o tema do sistema operacional
    // deixaria de ter efeito para sempre.
    ligarTema("dark");

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(CHAVE_TEMA)).toBeNull();
  });

  it("sobrevive a um ambiente sem matchMedia", () => {
    // jsdom nao traz matchMedia, e nem todo navegador antigo tem. Sem
    // guarda, a primeira renderizacao do app quebraria inteira por causa de
    // uma preferencia visual.
    vi.stubGlobal("matchMedia", undefined);

    expect(temaInicial()).toBe("light");
  });

  it("sobrevive a um localStorage que lanca", () => {
    // Modo privativo de alguns navegadores lanca em setItem. Perder a
    // persistencia e aceitavel; derrubar a tela por causa dela nao.
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("negado");
    };

    expect(() => escolherTema("dark")).not.toThrow();
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    Storage.prototype.setItem = original;
  });
});
