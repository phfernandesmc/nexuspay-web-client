import { test, expect, type Page } from "@playwright/test";

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
 *
 * COBERTURA AUSENTE, registrada em docs/superpowers/follow-ups-fatia-3a.md:
 * o caminho 3 do spec — renovacao por 401 no MEIO da sessao, com um access
 * token realmente expirado — nao esta aqui. Ele exige subir o gateway com
 * ACCESS_TOKEN_EXPIRE_MINUTES reduzido, o que esta suite nao faz.
 */

function digitoVerificador(base: number[]): number {
  const peso = base.length + 1;
  const soma = base.reduce((total, digito, i) => total + digito * (peso - i), 0);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

/**
 * CPF novo a cada chamada, com digitos verificadores calculados.
 *
 * A lista de dois CPFs fixos que estava aqui nao era repetivel: o CPF e
 * unico no gateway, entao eram 50% de colisao na primeira execucao e falha
 * CERTA na segunda contra o mesmo banco.
 */
function documentoValido(): string {
  let base: number[];
  do {
    base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
    // Sequencias de digito unico (111111111) sao formalmente validas pelos
    // verificadores e recusadas por qualquer validador serio de CPF.
  } while (base.every((digito) => digito === base[0]));

  const primeiro = digitoVerificador(base);
  const segundo = digitoVerificador([...base, primeiro]);
  return [...base, primeiro, segundo].join("");
}

async function registrarUsuarioNovo(page: Page, nome: string) {
  const sufixo = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(nome);
  await page.getByLabel("E-mail").fill(`e2e-${sufixo}@example.com`);
  await page.getByLabel("CPF").fill(documentoValido());
  await page.getByLabel("Senha").fill("senha1234");
  await page.getByRole("button", { name: "Criar conta" }).click();
}

test("registrar leva a sessao viva", async ({ page }) => {
  await registrarUsuarioNovo(page, "Teste Ponta A Ponta");

  await expect(page.getByRole("heading", { name: "Início" })).toBeVisible();
});

test("credencial errada mostra a mensagem traduzida", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("E-mail").fill("ninguem@example.com");
  await page.getByLabel("Senha").fill("errada12345");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByRole("alert")).toContainText("E-mail ou senha incorretos.");
});

test("recarregar restaura a sessao pelo refresh do BOOT, sem piscar o login", async ({ page }) => {
  // O nome diz exatamente o que este teste prova, e nao mais que isso: ele
  // exercita o refresh disparado na CARGA da pagina. A renovacao por 401 no
  // meio da sessao — o caminho 3 do spec — e outro mecanismo e continua sem
  // cobertura ponta a ponta.
  await registrarUsuarioNovo(page, "Teste Recarga");
  await expect(page.getByRole("heading", { name: "Início" })).toBeVisible();

  await page.reload();

  // O access token vive so em memoria e se perdeu no recarregamento. Voltar
  // autenticado prova que o cookie httpOnly e o boot silencioso funcionam
  // contra o gateway de verdade.
  await expect(page.getByRole("heading", { name: "Início" })).toBeVisible();
  await expect(page.getByText("Entrar na sua conta")).toHaveCount(0);
});
