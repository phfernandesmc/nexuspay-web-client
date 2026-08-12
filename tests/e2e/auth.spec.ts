import { test, expect } from "@playwright/test";

/**
 * Estes testes falam com o gateway DE VERDADE.
 *
 * Pre-requisitos: Postgres no ar (docker compose no repositorio do gateway)
 * e o gateway rodando em http://localhost:8000.
 *
 * Sao eles que pegam contrato quebrado. Os testes de Vitest usam MSW, e um
 * mock continua passando alegremente depois que o servidor muda um campo ou
 * um codigo de erro — foi exatamente assim que, na Fatia 1 deste projeto,
 * nove testes verdes conviveram com o recurso principal quebrado.
 */

function documentoValido(): string {
  // CPFs validos e fixos, para nao depender de gerador. Se um deles ja
  // estiver cadastrado no banco local, use o outro.
  const opcoes = ["39053344705", "11144477735"];
  return opcoes[Math.floor(Math.random() * opcoes.length)];
}

test("registrar leva a sessao viva", async ({ page }) => {
  const sufixo = Date.now();
  await page.goto("/register");

  await page.getByLabel("Nome completo").fill("Teste Ponta A Ponta");
  await page.getByLabel("E-mail").fill(`e2e-${sufixo}@example.com`);
  await page.getByLabel("CPF").fill(documentoValido());
  await page.getByLabel("Senha").fill("senha1234");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page.getByRole("heading", { name: "Início" })).toBeVisible();
});

test("credencial errada mostra a mensagem traduzida", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("E-mail").fill("ninguem@example.com");
  await page.getByLabel("Senha").fill("errada12345");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByRole("alert")).toContainText("E-mail ou senha incorretos.");
});

test("sessao sobrevive ao recarregamento sem piscar o login", async ({ page }) => {
  const sufixo = Date.now();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill("Teste Recarga");
  await page.getByLabel("E-mail").fill(`e2e-reload-${sufixo}@example.com`);
  await page.getByLabel("CPF").fill(documentoValido());
  await page.getByLabel("Senha").fill("senha1234");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByRole("heading", { name: "Início" })).toBeVisible();

  await page.reload();

  // O access token vive so em memoria e se perdeu no recarregamento. Voltar
  // autenticado prova que o cookie httpOnly e o boot silencioso funcionam
  // contra o gateway de verdade.
  await expect(page.getByRole("heading", { name: "Início" })).toBeVisible();
  await expect(page.getByText("Entrar na sua conta")).toHaveCount(0);
});
