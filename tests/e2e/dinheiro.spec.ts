import { test, expect, type Page } from "@playwright/test";

/**
 * Estes testes falam com o gateway DE VERDADE e PUBLICAM NA FILA SQS.
 *
 * A fila api-processar-transferencia-worker.fifo e COMPARTILHADA entre
 * desenvolvimento e producao. Este e o primeiro teste automatizado do
 * projeto que a toca, e ele so pode rodar contra o ambiente local, com
 * dados proprios por execucao. Nunca em automacao que rode sozinha.
 *
 * Pre-requisitos: Postgres no ar (container na porta 5433), o gateway em
 * http://localhost:8000, e — para a transacao sair de PENDING — o worker
 * rodando. Sem o worker, o teste verifica ate o estado pendente e para ai.
 */

function digitoVerificador(base: number[]): number {
  const peso = base.length + 1;
  const soma = base.reduce((total, digito, i) => total + digito * (peso - i), 0);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

function documentoValido(): string {
  let base: number[];
  do {
    base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  } while (base.every((digito) => digito === base[0]));
  const primeiro = digitoVerificador(base);
  const segundo = digitoVerificador([...base, primeiro]);
  return [...base, primeiro, segundo].join("");
}

async function registrar(page: Page, nome: string) {
  const sufixo = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(nome);
  await page.getByLabel("E-mail").fill(`e2e-dinheiro-${sufixo}@example.com`);
  await page.getByLabel("CPF").fill(documentoValido());
  await page.getByLabel("Senha").fill("senha1234");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByRole("heading", { name: "Início" })).toBeVisible();
}

async function abrirConta(page: Page) {
  await page.goto("/contas");
  await page.getByRole("button", { name: "Abrir conta" }).click();
  await page.getByLabel("Instituição").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Abrir", exact: true }).click();
  await expect(page.getByText("Sem apelido")).toBeVisible();
}

test("depositar leva ao comprovante com a transacao aceita", async ({ page }) => {
  await registrar(page, "Teste Deposito");
  await abrirConta(page);

  await page.goto("/depositar");
  await page.getByLabel("Conta").selectOption({ index: 1 });
  await page.getByLabel("Valor").fill("250.00");
  await page.getByRole("button", { name: "Enviar" }).click();

  await expect(page.getByRole("heading", { name: "Comprovante" })).toBeVisible();
  await expect(page.getByText("Pedido enviado agora.")).toBeVisible();
  // Sem o worker rodando, o estado fica em PENDING — e isso ja prova que o
  // gateway aceitou e devolveu 202.
  await expect(page.getByText(/Aceita, ainda não concluída|Concluída/)).toBeVisible();
});

test("o comprovante sobrevive ao recarregamento", async ({ page }) => {
  // A chave de idempotencia morre com o formulario. O comprovante nao, e e
  // por isso que nao persistir a chave e aceitavel.
  await registrar(page, "Teste Recarga Comprovante");
  await abrirConta(page);

  await page.goto("/depositar");
  await page.getByLabel("Conta").selectOption({ index: 1 });
  await page.getByLabel("Valor").fill("10.00");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByRole("heading", { name: "Comprovante" })).toBeVisible();

  const rota = new URL(page.url()).pathname;
  await page.reload();

  await expect(page.getByRole("heading", { name: "Comprovante" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(rota);
  // Depois do recarregamento o estado da navegacao se perdeu, entao a tela
  // nao afirma mais que o pedido foi enviado agora.
  await expect(page.getByText("Pedido enviado agora.")).toHaveCount(0);
});
