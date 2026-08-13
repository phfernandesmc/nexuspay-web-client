import { describe, it, expect } from "vitest";
import { formatarDataHora } from "@/lib/datetime";

describe("formatarDataHora", () => {
  it("formata conforme o locale", () => {
    const iso = "2026-03-09T14:30:00Z";
    const ptBR = formatarDataHora(iso, "pt-BR");
    const en = formatarDataHora(iso, "en");
    expect(ptBR).not.toBe(en);
    expect(ptBR).toContain("09");
    expect(en).toContain("3");
  });

  it("data invalida nao explode a tela", () => {
    // Um item de extrato com data corrompida nao pode derrubar a lista
    // inteira; melhor um traco do que uma tela branca.
    expect(formatarDataHora("nao e data", "pt-BR")).toBe("—");
  });
});
