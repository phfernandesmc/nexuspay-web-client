import { describe, it, expect, beforeEach } from "vitest";
import i18n from "@/app/i18n";

describe("i18n", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("pt-BR");
  });

  it("usa pt-BR como padrao", () => {
    expect(i18n.t("common:brand")).toBe("NexusPay");
    expect(i18n.t("auth:login.submit")).toBe("Entrar");
  });

  it("troca para ingles", async () => {
    await i18n.changeLanguage("en");
    expect(i18n.t("auth:login.submit")).toBe("Sign in");
  });

  it("cai no fallback pt-BR para idioma desconhecido", async () => {
    await i18n.changeLanguage("xx");
    expect(i18n.t("auth:login.submit")).toBe("Entrar");
  });

  it("nao deixa chave sem traducao virar a propria chave", () => {
    // Se a chave nao existir, o i18next devolve a chave crua. Isso e o
    // sintoma que este teste existe para tornar visivel.
    expect(i18n.t("auth:login.email")).not.toContain("auth:");
  });

  it("mantem o lang do documento em sincronia com o idioma", async () => {
    // Leitor de tela usa <html lang> para escolher a FONETICA. Com o valor
    // errado, "Transferencia" e "Saldo disponivel" sao lidos com pronuncia
    // inglesa — e o index.html vinha com lang="en" enquanto o fallback do
    // app e pt-BR.
    await i18n.changeLanguage("en");
    expect(document.documentElement.lang).toBe("en");

    await i18n.changeLanguage("pt-BR");
    expect(document.documentElement.lang).toBe("pt-BR");
  });
});
