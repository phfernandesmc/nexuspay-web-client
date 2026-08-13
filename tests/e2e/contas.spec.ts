import { test, expect } from "@playwright/test";

/**
 * Fala com o gateway DE VERDADE. Pre-requisitos: Postgres no ar (docker
 * compose no repositorio do gateway) e o gateway em http://localhost:8000.
 *
 * E ele que pega contrato quebrado: os testes de Vitest usam MSW, e um mock
 * continua passando depois que o servidor muda um campo.
 */

function cpf(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const digito = (nums: number[]) => {
    const peso = nums.length + 1;
    const soma = nums.reduce((s, n, i) => s + n * (peso - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = digito(base);
  const d2 = digito([...base, d1]);
  return [...base, d1, d2].join("");
}

async function registrar(page: import("@playwright/test").Page) {
  const sufixo = Date.now();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill("Teste Contas");
  await page.getByLabel("E-mail").fill(`e2e-contas-${sufixo}@example.com`);
  await page.getByLabel("CPF").fill(cpf());
  await page.getByLabel("Senha").fill("senha1234");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByRole("heading", { name: "Início" })).toBeVisible();
}

test("abrir uma conta e ve-la na lista", async ({ page }) => {
  await registrar(page);

  await page.getByRole("link", { name: "Contas" }).click();
  await expect(page.getByRole("heading", { name: "Suas contas" })).toBeVisible();
  await expect(page.getByText("Você ainda não tem contas. Abra a primeira.")).toBeVisible();

  await page.getByRole("button", { name: "Abrir conta" }).click();
  await page.getByLabel("Instituição").selectOption({ index: 1 });
  await page.getByLabel("Apelido (opcional)").fill("Minha primeira");
  await page.getByRole("button", { name: "Abrir" }).click();

  await expect(page.getByText("Minha primeira")).toBeVisible();
  await expect(page.getByText(/R\$\s?0,00/)).toBeVisible();
});

test("conta nova tem extrato vazio", async ({ page }) => {
  await registrar(page);
  await page.getByRole("link", { name: "Contas" }).click();
  await page.getByRole("button", { name: "Abrir conta" }).click();
  await page.getByLabel("Instituição").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Abrir" }).click();

  await page.getByText("Sem apelido").click();

  await expect(page.getByText("Nenhuma transação nesta conta ainda.")).toBeVisible();
});
