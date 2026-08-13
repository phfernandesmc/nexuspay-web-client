# Fatia 3b — Contas e extrato: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o dinheiro aparecer na tela — abrir, listar, renomear e encerrar contas, e ver o extrato paginado com o estado de cada transação.

**Architecture:** O TanStack Query passa a cuidar de todo estado vindo do servidor, com chaves de cache e uma regra de invalidação escrita. O Zustand continua com sessão e UI, e nada é copiado entre os dois. O extrato usa `useInfiniteQuery` casando com a paginação keyset do gateway, e o saldo em processamento é derivado por uma consulta dedicada.

**Tech Stack:** React 19.2.8, TanStack Query 5.101.4, Vite 8.2.1, TypeScript 7.0.2, Tailwind 4.3.3, shadcn, Zustand 5.0.14, Axios 1.19.0, react-router 8.3.0, i18next 26.3.6, Vitest 4.1.10, MSW 2.15.0, Playwright 1.62.1.

**Spec:** `docs/superpowers/specs/2026-08-12-fatia-3b-contas-extrato-design.md`

## Global Constraints

- **`@tanstack/react-query` na 5.101.4**, verificada no registro do npm (peer `react: ^18 || ^19`). Nenhuma outra versão do projeto muda.
- **API da v5, que difere da v4 em três pontos que quebram em silêncio:**
  - todos os hooks usam assinatura de **objeto**: `useQuery({ queryKey, queryFn })`, nunca posicional;
  - `useInfiniteQuery` exige **`initialPageParam` explícito** — na v4 o default vinha do `pageParam = 0` na assinatura, e isso não existe mais;
  - `queryClient.invalidateQueries({ queryKey })` só aceita a forma de objeto; a posicional foi removida.
  - Em `useInfiniteQuery`, a ordem das propriedades importa para inferência de tipo: `queryKey`, `queryFn`, `initialPageParam`, `getNextPageParam`, nessa ordem.
- **`refetchOnWindowFocus: false`** no `QueryClient`. Decisão do dono: nada busca sozinho.
- **Fronteira de estado:** Zustand cuida de sessão e UI; Query cuida do servidor. **Nenhum dado de servidor é copiado para o Zustand.**
- **Regra de invalidação:** toda operação que muda conta invalida `["contas"]`; o que for específico de uma conta invalida também `["conta", id]`, `["extrato", id]` e `["extrato-pendentes", id]`.
- **Dinheiro nunca é somado em ponto flutuante.** Converte para centavos inteiros, soma, formata no fim.
- **O `Decimal` do Pydantic chega como string OU número** conforme a versão. O parse aceita os dois e falha alto em qualquer outra coisa.
- **Formatação segue o idioma, a moeda não:** `Intl` com o locale ativo e sempre `BRL`.
- **Nenhuma string visível fora do i18next**, nos dois dicionários.
- **Nenhum estado otimista.**
- **Conta de outro usuário devolve 404**, e a interface trata como "não encontrada" — nunca mensagem de permissão.
- A porta do Vite é **5173 com `strictPort`**; `react-router` se importa de `react-router`; Tailwind v4 não tem `tailwind.config.js`; o alias `@` vive em `paths` de `tsconfig.app.json` e do `tsconfig.json` raiz.
- Commits em português, formato `tipo: descrição`, terminando com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

### Contrato da API, verificado no código do gateway

```
GET    /accounts                  -> 200 [AccountOut]        (só ativas)
POST   /accounts                  -> 201 AccountOut          { institution_id, type, alias? }
GET    /accounts/{id}             -> 200 AccountOut          (inclui encerrada)
PATCH  /accounts/{id}             -> 200 AccountOut          { alias }
DELETE /accounts/{id}             -> 204
GET    /accounts/{id}/statement   -> 200 StatementPage       ?cursor=&limit=  (limit 1..100)
GET    /institutions              -> 200 [InstitutionOut]

AccountOut     { id, branch, number, alias, type, balance, status, institution, created_at }
InstitutionOut { id, code, name, color_hex }
StatementPage  { items: [StatementItem], next_cursor: string | null }
StatementItem  { id, type, direction, amount, status, is_between_own_accounts, counterparty, created_at }
Counterparty   { holder_name, branch, number, institution }   // holder_name já vem mascarado

type      DEPOSIT | TRANSFER
direction IN | OUT
status    PENDING | COMPLETED | FAILED
AccountType   CHECKING | SAVINGS
AccountStatus ACTIVE | CLOSED
```

`limit` fora de 1..100 devolve `422`; o gateway rejeita em vez de clampar.

## Estrutura de arquivos

```
src/
  app/queryClient.ts                 QueryClient e defaults
  app/router.tsx                     + rotas /contas e /contas/:id
  main.tsx                           + QueryClientProvider
  lib/money.ts                       parse, soma em centavos, formatação BRL
  lib/datetime.ts                    formatação de data por locale
  components/layout/AppShell.tsx     + itens de navegação
  features/account/
    types.ts                         Conta, Instituicao e os enums
    api.ts                           chamadas cruas
    queries.ts                       hooks de leitura e mutação
    AccountsPage.tsx                 /contas
    AccountCard.tsx
    OpenAccountDialog.tsx
    AccountDetailPage.tsx            /contas/:id
    RenameAccountDialog.tsx
    CloseAccountDialog.tsx
  features/statement/
    types.ts                         ItemExtrato, PaginaExtrato, Contraparte
    api.ts                           buscarExtrato
    queries.ts                       useExtrato, usePendentesDeSaida
    StatementList.tsx
    StatementRow.tsx
    PendingBalanceLine.tsx
  locales/pt-BR.json  locales/en.json
tests/e2e/contas.spec.ts
```

---

### Task 1: QueryClient e provider

**Files:**
- Create: `src/app/queryClient.ts`
- Modify: `src/main.tsx`
- Test: `src/app/queryClient.test.ts`

**Interfaces:**
- Produces: `criarQueryClient(): QueryClient` — fábrica usada pela aplicação e pelos testes.

- [ ] **Step 1: Instalar a dependência**

```bash
npm install @tanstack/react-query@5.101.4
```

- [ ] **Step 2: Escrever o teste que falha**

`src/app/queryClient.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { criarQueryClient } from "@/app/queryClient";

describe("queryClient", () => {
  it("nao busca sozinho ao voltar para a aba", () => {
    // Decisao do dono: nada atualiza sem acao explicita. Este teste existe
    // para que ligar refetchOnWindowFocus por engano quebre a suite.
    const cliente = criarQueryClient();
    expect(cliente.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
  });

  it("nao repete requisicao que falhou", () => {
    // O cliente HTTP ja renova a sessao sozinho; repetir por cima disso
    // multiplicaria chamadas num 500 e esconderia a falha do usuario.
    const cliente = criarQueryClient();
    expect(cliente.getDefaultOptions().queries?.retry).toBe(false);
  });

  it("cada chamada devolve um cliente novo", () => {
    // Testes precisam de cache isolado; um cliente compartilhado faria um
    // teste enxergar o cache do outro.
    expect(criarQueryClient()).not.toBe(criarQueryClient());
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -- queryClient`
Expected: FAIL — o módulo não existe.

- [ ] **Step 4: Implementar**

`src/app/queryClient.ts`:

```ts
import { QueryClient } from "@tanstack/react-query";

/**
 * Uma fabrica, nao um singleton exportado.
 *
 * Cada teste precisa do proprio cache: um cliente compartilhado faria o
 * resultado de um teste vazar para o seguinte, e o sintoma seria uma falha
 * que so aparece quando a suite roda inteira.
 */
export function criarQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Decisao do dono: nada busca sozinho. Sem timer, sem refetch ao
        // voltar para a aba. Os dados ainda renovam ao navegar, porque a
        // consulta remonta e busca de novo se estiver velha.
        refetchOnWindowFocus: false,
        // O interceptor de lib/http.ts ja renova a sessao e repete a
        // requisicao uma vez. Repetir de novo aqui multiplicaria chamadas
        // num 500 e atrasaria o erro que o usuario precisa ver.
        retry: false,
      },
    },
  });
}
```

- [ ] **Step 5: Ligar o provider**

Em `src/main.tsx`, envolver o `App`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "@/App";
import { criarQueryClient } from "@/app/queryClient";
import "@/app/i18n";
import "@/index.css";

const queryClient = criarQueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 6: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS. Os 69 testes anteriores continuam verdes; os 3 novos levam a 72.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: TanStack Query com refetch automatico desligado

Fabrica em vez de singleton para cada teste ter cache proprio — cliente
compartilhado faz resultado de um teste vazar para o seguinte, e o sintoma
so aparece com a suite inteira.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Dinheiro e datas

**Files:**
- Create: `src/lib/money.ts`, `src/lib/datetime.ts`
- Test: `src/lib/money.test.ts`, `src/lib/datetime.test.ts`

**Interfaces:**
- Produces:
  - `paraCentavos(valor: string | number): number`
  - `somarCentavos(valores: number[]): number`
  - `formatarDinheiro(centavos: number, locale: string): string`
  - `formatarDataHora(iso: string, locale: string): string`

- [ ] **Step 1: Escrever o teste que falha**

`src/lib/money.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { paraCentavos, somarCentavos, formatarDinheiro } from "@/lib/money";

describe("paraCentavos", () => {
  it("aceita string, que e como o Pydantic costuma serializar Decimal", () => {
    expect(paraCentavos("1234.56")).toBe(123456);
    expect(paraCentavos("0.01")).toBe(1);
    expect(paraCentavos("100")).toBe(10000);
    expect(paraCentavos("100.5")).toBe(10050);
  });

  it("aceita numero, que e como algumas versoes do Pydantic serializam", () => {
    expect(paraCentavos(1234.56)).toBe(123456);
    expect(paraCentavos(0.1)).toBe(10);
  });

  it("aceita negativo", () => {
    expect(paraCentavos("-50.00")).toBe(-5000);
  });

  it("falha alto em qualquer outra coisa", () => {
    // Silenciar aqui produziria um total errado na tela sem nenhum sinal.
    expect(() => paraCentavos("abc")).toThrow();
    expect(() => paraCentavos("")).toThrow();
    expect(() => paraCentavos("1.234")).toThrow();
  });
});

describe("somarCentavos", () => {
  it("soma valores que quebram em ponto flutuante", () => {
    // 0.1 + 0.2 em ponto flutuante da 0.30000000000000004, e num total
    // visivel na tela isso aparece. Em centavos inteiros nao ha residuo.
    const total = somarCentavos([paraCentavos("0.10"), paraCentavos("0.20")]);
    expect(total).toBe(30);
    expect(formatarDinheiro(total, "pt-BR")).not.toContain("0000");
  });

  it("soma uma lista longa sem acumular erro", () => {
    const cem = Array.from({ length: 100 }, () => paraCentavos("0.07"));
    expect(somarCentavos(cem)).toBe(700);
  });

  it("lista vazia da zero", () => {
    expect(somarCentavos([])).toBe(0);
  });
});

describe("formatarDinheiro", () => {
  it("usa BRL mesmo em ingles", () => {
    // A moeda nao segue o idioma: o dinheiro e real em qualquer lingua.
    const emIngles = formatarDinheiro(120000, "en");
    expect(emIngles).toContain("R$");
    expect(emIngles).not.toContain("$1");
  });

  it("formata com o separador do locale", () => {
    expect(formatarDinheiro(123456, "pt-BR")).toContain("1.234,56");
    expect(formatarDinheiro(123456, "en")).toContain("1,234.56");
  });
});
```

`src/lib/datetime.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- money`
Expected: FAIL — os módulos não existem.

- [ ] **Step 3: Implementar o dinheiro**

`src/lib/money.ts`:

```ts
/**
 * Dinheiro em centavos inteiros, nunca em ponto flutuante.
 *
 * 0.1 + 0.2 em JavaScript da 0.30000000000000004. Num total somado de
 * varias transacoes e exibido na tela, esse residuo aparece.
 */

const FORMATO = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Converte o valor monetario da API em centavos.
 *
 * O Decimal do Pydantic chega como string ou como numero conforme a versao
 * — os testes da fatia 3a ja tratavam dos dois. Quando chega como numero, a
 * precisao ja foi decidida pelo servidor e o toFixed(2) so o normaliza.
 */
export function paraCentavos(valor: string | number): number {
  const texto = typeof valor === "number" ? valor.toFixed(2) : valor.trim();
  const casado = FORMATO.exec(texto);
  if (casado === null) {
    throw new Error(`valor monetario invalido: ${JSON.stringify(valor)}`);
  }
  const [, sinal, inteiros, decimais = ""] = casado;
  const centavos = Number(inteiros) * 100 + Number(decimais.padEnd(2, "0"));
  return sinal === "-" ? -centavos : centavos;
}

export function somarCentavos(valores: number[]): number {
  return valores.reduce((total, atual) => total + atual, 0);
}

/**
 * A moeda nao segue o idioma. Em ingles sai "R$ 1,234.56", nao "$1,234.56":
 * o separador acompanha o locale, o simbolo continua sendo o do real.
 */
export function formatarDinheiro(centavos: number, locale: string): string {
  // Dividir por 100 aqui e seguro: a divisao acontece uma unica vez, no fim,
  // sobre um inteiro exato. O erro de ponto flutuante que importa e o
  // acumulado em somas sucessivas, e essas ja aconteceram em centavos.
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}
```

- [ ] **Step 4: Implementar a data**

`src/lib/datetime.ts`:

```ts
/**
 * Data no idioma da interface.
 *
 * Data invalida devolve um traco em vez de lancar: um unico item de extrato
 * com data corrompida nao pode derrubar a lista inteira.
 */
export function formatarDataHora(iso: string, locale: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Provar que a soma em centavos é o que segura**

Troque temporariamente `somarCentavos` por uma soma em reais:

```ts
export function somarCentavos(valores: number[]): number {
  return valores.reduce((t, a) => t + a / 100, 0) * 100;
}
```

Rode `npm test -- money`.
Expected: FAIL em `soma valores que quebram em ponto flutuante`. **Restaure** e confirme o verde.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: dinheiro em centavos inteiros e datas por locale

A moeda nao segue o idioma: em ingles sai R\$ 1,234.56, com separador do
locale e simbolo do real.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Domínio de conta — tipos, api e consultas de leitura

**Files:**
- Create: `src/features/account/types.ts`, `src/features/account/api.ts`, `src/features/account/queries.ts`
- Create: `src/test/queryWrapper.tsx`
- Test: `src/features/account/queries.test.tsx`

**Interfaces:**
- Consumes: `http` de `@/lib/http`.
- Produces:
  - `type Conta = { id, branch, number, alias, type, balance, status, institution, created_at }`
  - `type Instituicao = { id, code, name, color_hex }`
  - `listarContas() -> Promise<Conta[]>`, `buscarConta(id) -> Promise<Conta>`, `listarInstituicoes() -> Promise<Instituicao[]>`
  - `useContas()`, `useConta(id)`, `useInstituicoes()`
  - `CHAVES` — objeto com as chaves de cache
  - `envolverComQuery(ui: ReactNode)` de `@/test/queryWrapper` — utilitário de teste

- [ ] **Step 1: Escrever os tipos**

`src/features/account/types.ts`:

```ts
export type TipoConta = "CHECKING" | "SAVINGS";
export type StatusConta = "ACTIVE" | "CLOSED";

export type Instituicao = {
  id: string;
  code: string;
  name: string;
  color_hex: string;
};

export type Conta = {
  id: string;
  branch: string;
  number: string;
  alias: string | null;
  type: TipoConta;
  /** Decimal do Pydantic: string ou numero. Use paraCentavos de @/lib/money. */
  balance: string | number;
  status: StatusConta;
  institution: Instituicao;
  created_at: string;
};
```

- [ ] **Step 2: Escrever o utilitário de teste**

`src/test/queryWrapper.tsx`:

```tsx
import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { criarQueryClient } from "@/app/queryClient";

/**
 * Monta a arvore com um QueryClient NOVO a cada chamada.
 *
 * Reaproveitar o cliente entre testes faria um teste enxergar o cache do
 * anterior, e a falha so apareceria com a suite inteira rodando.
 */
export function envolverComQuery(ui: ReactNode) {
  return render(
    <QueryClientProvider client={criarQueryClient()}>{ui}</QueryClientProvider>,
  );
}
```

- [ ] **Step 3: Escrever o teste que falha**

`src/features/account/queries.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http as mswHttp, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { servidor, URL_TESTE } from "@/test/msw";
import { criarQueryClient } from "@/app/queryClient";
import { useSession } from "@/features/auth/session.store";
import { useContas, useConta, useInstituicoes, CHAVES } from "@/features/account/queries";

const instituicao = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  code: "001",
  name: "Banco Um",
  color_hex: "#112233",
};

const conta = {
  id: "cccccccc-0000-0000-0000-000000000001",
  branch: "0001",
  number: "12345678-9",
  alias: "Salario",
  type: "CHECKING" as const,
  balance: "500.00",
  status: "ACTIVE" as const,
  institution: instituicao,
  created_at: "2026-03-09T14:30:00Z",
};

function envolver({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={criarQueryClient()}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  useSession.setState({
    accessToken: "tok",
    user: null,
    status: "authenticated",
    motivoEncerramento: null,
  });
});

describe("consultas de conta", () => {
  it("as chaves de cache seguem o padrao acordado", () => {
    // A invalidacao depende delas. Mudar uma chave sem mudar a outra ponta
    // deixa o cache velho na tela sem quebrar nada.
    expect(CHAVES.contas()).toEqual(["contas"]);
    expect(CHAVES.conta("x")).toEqual(["conta", "x"]);
    expect(CHAVES.extrato("x")).toEqual(["extrato", "x"]);
    expect(CHAVES.extratoPendentes("x")).toEqual(["extrato-pendentes", "x"]);
    expect(CHAVES.instituicoes()).toEqual(["instituicoes"]);
  });

  it("useContas lista as contas", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([conta])),
    );

    const { result } = renderHook(() => useContas(), { wrapper: envolver });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].alias).toBe("Salario");
  });

  it("useConta busca uma conta", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${conta.id}`, () => HttpResponse.json(conta)),
    );

    const { result } = renderHook(() => useConta(conta.id), { wrapper: envolver });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.branch).toBe("0001");
  });

  it("useInstituicoes lista o catalogo", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/institutions`, () => HttpResponse.json([instituicao])),
    );

    const { result } = renderHook(() => useInstituicoes(), { wrapper: envolver });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].color_hex).toBe("#112233");
  });

  it("conta de outro usuario chega como erro, nao como dado vazio", async () => {
    // O gateway devolve 404 de proposito para conta alheia — um 403
    // confirmaria que o id existe. A consulta precisa refletir isso como
    // erro, para a tela dizer "nao encontrada".
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${conta.id}`, () =>
        HttpResponse.json(
          { error: { code: "ACCOUNT_NOT_FOUND", message: "x", details: {} } },
          { status: 404 },
        ),
      ),
    );

    const { result } = renderHook(() => useConta(conta.id), { wrapper: envolver });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npm test -- account/queries`
Expected: FAIL — os módulos não existem.

- [ ] **Step 5: Implementar a api**

`src/features/account/api.ts`:

```ts
import { http } from "@/lib/http";
import type { Conta, Instituicao, TipoConta } from "@/features/account/types";

export async function listarContas(): Promise<Conta[]> {
  const { data } = await http.get<Conta[]>("/accounts");
  return data;
}

export async function buscarConta(id: string): Promise<Conta> {
  const { data } = await http.get<Conta>(`/accounts/${id}`);
  return data;
}

export async function listarInstituicoes(): Promise<Instituicao[]> {
  const { data } = await http.get<Instituicao[]>("/institutions");
  return data;
}

export async function abrirConta(entrada: {
  institution_id: string;
  type: TipoConta;
  alias: string | null;
}): Promise<Conta> {
  const { data } = await http.post<Conta>("/accounts", entrada);
  return data;
}

export async function renomearConta(id: string, alias: string | null): Promise<Conta> {
  const { data } = await http.patch<Conta>(`/accounts/${id}`, { alias });
  return data;
}

export async function encerrarConta(id: string): Promise<void> {
  await http.delete(`/accounts/${id}`);
}
```

- [ ] **Step 6: Implementar as consultas de leitura**

`src/features/account/queries.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { buscarConta, listarContas, listarInstituicoes } from "@/features/account/api";

/**
 * As chaves de cache do projeto inteiro, em um lugar so.
 *
 * A invalidacao depende delas casarem exatamente. Chave escrita a mao no
 * ponto de uso e como um saldo velho fica na tela: nada quebra, o numero
 * so para de atualizar.
 */
export const CHAVES = {
  contas: () => ["contas"] as const,
  conta: (id: string) => ["conta", id] as const,
  extrato: (contaId: string) => ["extrato", contaId] as const,
  extratoPendentes: (contaId: string) => ["extrato-pendentes", contaId] as const,
  instituicoes: () => ["instituicoes"] as const,
};

export function useContas() {
  return useQuery({ queryKey: CHAVES.contas(), queryFn: listarContas });
}

export function useConta(id: string) {
  return useQuery({ queryKey: CHAVES.conta(id), queryFn: () => buscarConta(id) });
}

export function useInstituicoes() {
  return useQuery({
    queryKey: CHAVES.instituicoes(),
    queryFn: listarInstituicoes,
    // O catalogo praticamente nao muda; buscar a cada montagem seria
    // requisicao desperdicada em toda abertura do dialogo.
    staleTime: 60 * 60 * 1000,
  });
}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: consultas de leitura de conta e o padrao de chaves

As chaves ficam num objeto unico porque a invalidacao depende de casarem
exatamente. Chave escrita a mao no ponto de uso e como saldo velho fica na
tela: nada quebra, o numero so para de atualizar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Lista de contas

**Files:**
- Create: `src/features/account/AccountCard.tsx`, `src/features/account/AccountsPage.tsx`
- Modify: `src/locales/pt-BR.json`, `src/locales/en.json`
- Test: `src/features/account/AccountsPage.test.tsx`

**Interfaces:**
- Consumes: `useContas`, `Conta`, `formatarDinheiro`, `paraCentavos`.
- Produces: `AccountsPage`, `AccountCard` — o card recebe `{ conta: Conta }`.

- [ ] **Step 1: Acrescentar as chaves de tradução**

Em `src/locales/pt-BR.json`, dentro do objeto raiz, acrescentar um espaço `account`:

```json
"account": {
  "title": "Suas contas",
  "empty": "Você ainda não tem contas. Abra a primeira.",
  "open": "Abrir conta",
  "branch": "Agência",
  "number": "Conta",
  "balance": "Saldo",
  "checking": "Corrente",
  "savings": "Poupança",
  "closed": "Encerrada",
  "noAlias": "Sem apelido"
}
```

Em `src/locales/en.json`:

```json
"account": {
  "title": "Your accounts",
  "empty": "You don't have any accounts yet. Open your first one.",
  "open": "Open account",
  "branch": "Branch",
  "number": "Account",
  "balance": "Balance",
  "checking": "Checking",
  "savings": "Savings",
  "closed": "Closed",
  "noAlias": "No nickname"
}
```

Acrescente `"account"` ao array `ns` em `src/app/i18n.ts`.

- [ ] **Step 2: Escrever o teste que falha**

`src/features/account/AccountsPage.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import AccountsPage from "@/features/account/AccountsPage";
import i18n from "@/app/i18n";

const instituicao = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  code: "001",
  name: "Banco Um",
  color_hex: "#112233",
};

const conta = {
  id: "cccccccc-0000-0000-0000-000000000001",
  branch: "0001",
  number: "12345678-9",
  alias: "Salario",
  type: "CHECKING" as const,
  balance: "1234.56",
  status: "ACTIVE" as const,
  institution: instituicao,
  created_at: "2026-03-09T14:30:00Z",
};

function montar() {
  return envolverComQuery(
    <MemoryRouter>
      <AccountsPage />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({
    accessToken: "tok",
    user: null,
    status: "authenticated",
    motivoEncerramento: null,
  });
});

describe("lista de contas", () => {
  it("mostra o saldo formatado em real", async () => {
    servidor.use(mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([conta])));
    montar();

    expect(await screen.findByText("Salario")).toBeInTheDocument();
    expect(screen.getByText(/1\.234,56/)).toBeInTheDocument();
  });

  it("usa a cor da instituicao no cartao", async () => {
    // O color_hex existe na API para a interface diferenciar instituicoes.
    servidor.use(mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([conta])));
    montar();

    const cartao = await screen.findByTestId(`conta-${conta.id}`);
    expect(cartao.getAttribute("style")).toContain("#112233");
  });

  it("conta sem apelido nao mostra vazio", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json([{ ...conta, alias: null }]),
      ),
    );
    montar();

    expect(await screen.findByText("Sem apelido")).toBeInTheDocument();
  });

  it("sem contas mostra estado vazio proprio", async () => {
    servidor.use(mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([])));
    montar();

    expect(
      await screen.findByText("Você ainda não tem contas. Abra a primeira."),
    ).toBeInTheDocument();
  });

  it("falha de rede mostra mensagem traduzida, nao tela vazia", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.error()),
    );
    montar();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Não conseguimos falar com o servidor. Verifique sua conexão.",
      ),
    );
  });

  it("trocar o idioma reformata o valor sem nova requisicao", async () => {
    let chamadas = 0;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () => {
        chamadas += 1;
        return HttpResponse.json([conta]);
      }),
    );
    montar();
    await screen.findByText(/1\.234,56/);

    await i18n.changeLanguage("en");

    await waitFor(() => expect(screen.getByText(/1,234\.56/)).toBeInTheDocument());
    expect(chamadas).toBe(1);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -- AccountsPage`
Expected: FAIL — os componentes não existem.

- [ ] **Step 4: Implementar o cartão**

`src/features/account/AccountCard.tsx`:

```tsx
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { Conta } from "@/features/account/types";
import { formatarDinheiro, paraCentavos } from "@/lib/money";

const ROTULO_TIPO = { CHECKING: "account:checking", SAVINGS: "account:savings" } as const;

export default function AccountCard({ conta }: { conta: Conta }) {
  const { t, i18n } = useTranslation(["account", "common"]);

  return (
    <Link
      to={`/contas/${conta.id}`}
      data-testid={`conta-${conta.id}`}
      className="block rounded-lg border-l-4 p-4 hover:bg-muted"
      // A cor vem da instituicao: e o que o color_hex existe para fazer.
      style={{ borderLeftColor: conta.institution.color_hex }}
    >
      <p className="font-medium">{conta.alias ?? t("account:noAlias")}</p>
      <p className="text-sm text-muted-foreground">
        {conta.institution.name} · {t("account:branch")} {conta.branch} ·{" "}
        {t("account:number")} {conta.number} · {t(ROTULO_TIPO[conta.type])}
      </p>
      <p className="mt-2 text-xl font-semibold">
        {formatarDinheiro(paraCentavos(conta.balance), i18n.resolvedLanguage ?? "pt-BR")}
      </p>
    </Link>
  );
}
```

- [ ] **Step 5: Implementar a página**

`src/features/account/AccountsPage.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AccountCard from "@/features/account/AccountCard";
import { useContas } from "@/features/account/queries";
import { chaveDeTraducao, extrairErro } from "@/lib/errors";

export default function AccountsPage() {
  const { t } = useTranslation(["account", "common", "errors"]);
  const { data: contas, isPending, isError, error } = useContas();

  if (isPending) return <p>{t("common:loading")}</p>;

  if (isError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>
          {t(chaveDeTraducao(extrairErro(error).code), { ns: "errors" })}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold">{t("account:title")}</h1>
      {contas.length === 0 ? (
        <p className="mt-4 text-muted-foreground">{t("account:empty")}</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {contas.map((conta) => (
            <AccountCard key={conta.id} conta={conta} />
          ))}
        </div>
      )}
    </section>
  );
}
```

O `chaveDeTraducao` aqui é usado pelo efeito colateral de avisar no console em código desconhecido; o `t` recebe o retorno dele, que já é `errors.<CODIGO>` ou `errors.UNKNOWN`. **Confira como a Fatia 3a resolveu isso em `LoginPage.tsx`** e siga o mesmo padrão — houve uma correção lá sobre o separador de namespace, e repetir o erro custaria mostrar a chave crua ao usuário.

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: lista de contas com saldo formatado e cor da instituicao

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Abrir conta

**Files:**
- Create: `src/features/account/OpenAccountDialog.tsx`
- Modify: `src/features/account/queries.ts`, `src/features/account/AccountsPage.tsx`, os dois dicionários
- Test: `src/features/account/OpenAccountDialog.test.tsx`

**Interfaces:**
- Produces: `useAbrirConta()` — mutação que invalida `["contas"]` no sucesso; `OpenAccountDialog`.

- [ ] **Step 1: Acrescentar as chaves de tradução**

Em `account` de `src/locales/pt-BR.json`:

```json
"openTitle": "Abrir uma conta",
"institution": "Instituição",
"type": "Tipo",
"alias": "Apelido (opcional)",
"confirm": "Abrir",
"cancel": "Cancelar"
```

Em `src/locales/en.json`:

```json
"openTitle": "Open an account",
"institution": "Institution",
"type": "Type",
"alias": "Nickname (optional)",
"confirm": "Open",
"cancel": "Cancel"
```

- [ ] **Step 2: Escrever o teste que falha**

`src/features/account/OpenAccountDialog.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import OpenAccountDialog from "@/features/account/OpenAccountDialog";
import i18n from "@/app/i18n";

const instituicao = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  code: "001",
  name: "Banco Um",
  color_hex: "#112233",
};

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({
    accessToken: "tok",
    user: null,
    status: "authenticated",
    motivoEncerramento: null,
  });
});

describe("abrir conta", () => {
  it("cria a conta e REFAZ a lista", async () => {
    // Este e o teste que pega o defeito silencioso da fatia: sem a
    // invalidacao, a conta e criada no servidor e a lista na tela continua
    // sem ela. Nada quebra — so fica errado.
    let listagens = 0;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/institutions`, () => HttpResponse.json([instituicao])),
      mswHttp.get(`${URL_TESTE}/accounts`, () => {
        listagens += 1;
        return HttpResponse.json([]);
      }),
      mswHttp.post(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json({ id: "nova" }, { status: 201 }),
      ),
    );

    envolverComQuery(<OpenAccountDialog aberto onFechar={() => {}} />);
    await screen.findByLabelText("Instituição");
    await userEvent.selectOptions(screen.getByLabelText("Instituição"), instituicao.id);
    await userEvent.click(screen.getByRole("button", { name: "Abrir" }));

    await waitFor(() => expect(listagens).toBeGreaterThanOrEqual(1));
  });

  it("limite de contas mostra a mensagem propria", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/institutions`, () => HttpResponse.json([instituicao])),
      mswHttp.post(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json(
          { error: { code: "ACCOUNT_LIMIT_REACHED", message: "x", details: { limit: 10 } } },
          { status: 422 },
        ),
      ),
    );

    envolverComQuery(<OpenAccountDialog aberto onFechar={() => {}} />);
    await screen.findByLabelText("Instituição");
    await userEvent.selectOptions(screen.getByLabelText("Instituição"), instituicao.id);
    await userEvent.click(screen.getByRole("button", { name: "Abrir" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Você atingiu o limite de contas ativas.",
    );
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -- OpenAccountDialog`
Expected: FAIL — o componente não existe.

- [ ] **Step 4: Acrescentar a mutação**

Em `src/features/account/queries.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { abrirConta, buscarConta, listarContas, listarInstituicoes } from "@/features/account/api";
import type { TipoConta } from "@/features/account/types";

// ... CHAVES, useContas, useConta, useInstituicoes ficam como estao ...

export function useAbrirConta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: abrirConta,
    // Regra do projeto: toda operacao que muda conta invalida a lista.
    // Esquecer esta linha nao quebra nada — so deixa a tela mostrando o
    // estado anterior, que e o defeito que ninguem nota.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHAVES.contas() });
    },
  });
}
```

Note a forma de objeto em `invalidateQueries` — a posicional foi removida na v5.

- [ ] **Step 5: Implementar o diálogo**

`src/features/account/OpenAccountDialog.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAbrirConta, useInstituicoes } from "@/features/account/queries";
import type { TipoConta } from "@/features/account/types";
import { chaveDeTraducao, extrairErro } from "@/lib/errors";

export default function OpenAccountDialog({
  aberto,
  onFechar,
}: {
  aberto: boolean;
  onFechar: () => void;
}) {
  const { t } = useTranslation(["account", "errors"]);
  const { data: instituicoes } = useInstituicoes();
  const abrir = useAbrirConta();
  const [instituicaoId, setInstituicaoId] = useState("");
  const [tipo, setTipo] = useState<TipoConta>("CHECKING");
  const [alias, setAlias] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  if (!aberto) return null;

  async function aoConfirmar() {
    setErro(null);
    try {
      await abrir.mutateAsync({
        institution_id: instituicaoId,
        type: tipo,
        alias: alias.trim() === "" ? null : alias.trim(),
      });
      onFechar();
    } catch (falha) {
      setErro(t(chaveDeTraducao(extrairErro(falha).code), { ns: "errors" }));
    }
  }

  return (
    <div role="dialog" aria-label={t("account:openTitle")} className="rounded border p-4">
      <h2 className="text-lg font-semibold">{t("account:openTitle")}</h2>

      <div className="mt-4 flex flex-col gap-2">
        <Label htmlFor="instituicao">{t("account:institution")}</Label>
        <select
          id="instituicao"
          className="rounded border px-2 py-1"
          value={instituicaoId}
          onChange={(e) => setInstituicaoId(e.target.value)}
        >
          <option value="" />
          {instituicoes?.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Label htmlFor="tipo">{t("account:type")}</Label>
        <select
          id="tipo"
          className="rounded border px-2 py-1"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoConta)}
        >
          <option value="CHECKING">{t("account:checking")}</option>
          <option value="SAVINGS">{t("account:savings")}</option>
        </select>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Label htmlFor="alias">{t("account:alias")}</Label>
        <Input id="alias" maxLength={50} value={alias} onChange={(e) => setAlias(e.target.value)} />
      </div>

      {erro !== null && (
        <Alert variant="destructive" role="alert" className="mt-4">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <div className="mt-4 flex gap-2">
        <Button onClick={() => void aoConfirmar()} disabled={abrir.isPending || instituicaoId === ""}>
          {t("account:confirm")}
        </Button>
        <Button variant="outline" onClick={onFechar}>
          {t("account:cancel")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Ligar na página**

Em `AccountsPage.tsx`, acrescentar um botão que abre o diálogo, com estado local `const [abrindo, setAbrindo] = useState(false)`, rotulado por `t("account:open")`.

- [ ] **Step 7: Rodar e ver passar**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Provar que a invalidação é o que segura**

Remova o `onSuccess` de `useAbrirConta` e rode `npm test -- OpenAccountDialog`.
Expected: FAIL em `cria a conta e REFAZ a lista`. **Restaure** e confirme o verde.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: abrir conta, com a lista refeita depois

O teste da invalidacao existe porque esquece-la nao quebra nada: a conta e
criada no servidor e a tela continua mostrando a lista antiga.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Detalhe da conta — renomear e encerrar

**Files:**
- Create: `src/features/account/AccountDetailPage.tsx`, `src/features/account/RenameAccountDialog.tsx`, `src/features/account/CloseAccountDialog.tsx`
- Modify: `src/features/account/queries.ts`, os dois dicionários
- Test: `src/features/account/AccountDetailPage.test.tsx`

**Interfaces:**
- Produces: `useRenomearConta()`, `useEncerrarConta()` — as duas invalidam `["contas"]` e as três chaves da conta; `AccountDetailPage`.

- [ ] **Step 1: Acrescentar as chaves de tradução**

Em `account` de `pt-BR.json`: `"rename": "Renomear"`, `"close": "Encerrar conta"`, `"closeConfirm": "Encerrar esta conta? Ela sai da sua lista."`, `"notFound": "Conta não encontrada."`, `"save": "Salvar"`.

Em `en.json`: `"rename": "Rename"`, `"close": "Close account"`, `"closeConfirm": "Close this account? It will leave your list."`, `"notFound": "Account not found."`, `"save": "Save"`.

- [ ] **Step 2: Escrever o teste que falha**

`src/features/account/AccountDetailPage.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import AccountDetailPage from "@/features/account/AccountDetailPage";
import i18n from "@/app/i18n";

const instituicao = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  code: "001",
  name: "Banco Um",
  color_hex: "#112233",
};

const conta = {
  id: "cccccccc-0000-0000-0000-000000000001",
  branch: "0001",
  number: "12345678-9",
  alias: "Salario",
  type: "CHECKING" as const,
  balance: "500.00",
  status: "ACTIVE" as const,
  institution: instituicao,
  created_at: "2026-03-09T14:30:00Z",
};

const extratoVazio = { items: [], next_cursor: null };

function montar() {
  return envolverComQuery(
    <MemoryRouter initialEntries={[`/contas/${conta.id}`]}>
      <Routes>
        <Route path="/contas/:id" element={<AccountDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({
    accessToken: "tok",
    user: null,
    status: "authenticated",
    motivoEncerramento: null,
  });
  servidor.use(
    mswHttp.get(`${URL_TESTE}/accounts/${conta.id}/statement`, () =>
      HttpResponse.json(extratoVazio),
    ),
  );
});

describe("detalhe da conta", () => {
  it("encerrar conta com saldo mostra a mensagem de saldo", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${conta.id}`, () => HttpResponse.json(conta)),
      mswHttp.delete(`${URL_TESTE}/accounts/${conta.id}`, () =>
        HttpResponse.json(
          { error: { code: "ACCOUNT_HAS_BALANCE", message: "x", details: {} } },
          { status: 422 },
        ),
      ),
    );
    montar();

    await userEvent.click(await screen.findByRole("button", { name: "Encerrar conta" }));
    await userEvent.click(screen.getByRole("button", { name: "Encerrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não é possível encerrar uma conta com saldo.",
    );
  });

  it("encerrar conta com pendencia mostra mensagem DISTINTA da de saldo", async () => {
    // A fatia 2b acrescentou este erro justamente para impedir encerrar
    // conta com dinheiro a caminho. Confundi-lo com o de saldo faria o
    // usuario zerar a conta e continuar sem conseguir encerrar.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${conta.id}`, () => HttpResponse.json(conta)),
      mswHttp.delete(`${URL_TESTE}/accounts/${conta.id}`, () =>
        HttpResponse.json(
          { error: { code: "ACCOUNT_HAS_PENDING_TRANSACTIONS", message: "x", details: {} } },
          { status: 422 },
        ),
      ),
    );
    montar();

    await userEvent.click(await screen.findByRole("button", { name: "Encerrar conta" }));
    await userEvent.click(screen.getByRole("button", { name: "Encerrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não é possível encerrar a conta com transações pendentes.",
    );
  });

  it("renomear atualiza o apelido na tela", async () => {
    let apelido = "Salario";
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${conta.id}`, () =>
        HttpResponse.json({ ...conta, alias: apelido }),
      ),
      mswHttp.patch(`${URL_TESTE}/accounts/${conta.id}`, async ({ request }) => {
        const corpo = (await request.json()) as { alias: string };
        apelido = corpo.alias;
        return HttpResponse.json({ ...conta, alias: apelido });
      }),
    );
    montar();

    await userEvent.click(await screen.findByRole("button", { name: "Renomear" }));
    const campo = screen.getByLabelText("Apelido (opcional)");
    await userEvent.clear(campo);
    await userEvent.type(campo, "Reserva");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Reserva")).toBeInTheDocument();
  });

  it("conta de outro usuario diz nao encontrada, nunca sem permissao", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${conta.id}`, () =>
        HttpResponse.json(
          { error: { code: "ACCOUNT_NOT_FOUND", message: "x", details: {} } },
          { status: 404 },
        ),
      ),
    );
    montar();

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Conta não encontrada.");
    expect(alerta.textContent).not.toMatch(/permiss|autoriz/i);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -- AccountDetailPage`
Expected: FAIL — os componentes não existem.

- [ ] **Step 4: Acrescentar as mutações**

Em `src/features/account/queries.ts`:

```ts
/** Invalida tudo que depende de uma conta especifica, mais a lista. */
function invalidarConta(qc: ReturnType<typeof useQueryClient>, id: string) {
  void qc.invalidateQueries({ queryKey: CHAVES.contas() });
  void qc.invalidateQueries({ queryKey: CHAVES.conta(id) });
  void qc.invalidateQueries({ queryKey: CHAVES.extrato(id) });
  void qc.invalidateQueries({ queryKey: CHAVES.extratoPendentes(id) });
}

export function useRenomearConta(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alias: string | null) => renomearConta(id, alias),
    onSuccess: () => invalidarConta(qc, id),
  });
}

export function useEncerrarConta(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => encerrarConta(id),
    onSuccess: () => invalidarConta(qc, id),
  });
}
```

- [ ] **Step 5: Acrescentar mais uma chave de tradução**

O botão que **abre** o diálogo se chama `Encerrar conta`. O botão que **confirma** dentro dele precisa de texto diferente, senão a busca por papel fica ambígua e o teste quebra — foi um defeito real na Fatia 3a, com "Início" aparecendo no menu e no título.

Em `account` de `pt-BR.json`: `"closeConfirmButton": "Encerrar"`. Em `en.json`: `"closeConfirmButton": "Close"`.

- [ ] **Step 6: Implementar os dois diálogos**

`src/features/account/RenameAccountDialog.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRenomearConta } from "@/features/account/queries";
import type { Conta } from "@/features/account/types";
import { chaveDeTraducao, extrairErro } from "@/lib/errors";

export default function RenameAccountDialog({
  conta,
  aberto,
  onFechar,
}: {
  conta: Conta;
  aberto: boolean;
  onFechar: () => void;
}) {
  const { t } = useTranslation(["account", "errors"]);
  const renomear = useRenomearConta(conta.id);
  const [alias, setAlias] = useState(conta.alias ?? "");
  const [erro, setErro] = useState<string | null>(null);

  if (!aberto) return null;

  async function aoSalvar() {
    setErro(null);
    try {
      await renomear.mutateAsync(alias.trim() === "" ? null : alias.trim());
      onFechar();
    } catch (falha) {
      setErro(t(chaveDeTraducao(extrairErro(falha).code), { ns: "errors" }));
    }
  }

  return (
    <div role="dialog" aria-label={t("account:rename")} className="rounded border p-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="alias-renomear">{t("account:alias")}</Label>
        <Input
          id="alias-renomear"
          maxLength={50}
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
        />
      </div>

      {erro !== null && (
        <Alert variant="destructive" role="alert" className="mt-4">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <div className="mt-4 flex gap-2">
        <Button onClick={() => void aoSalvar()} disabled={renomear.isPending}>
          {t("account:save")}
        </Button>
        <Button variant="outline" onClick={onFechar}>
          {t("account:cancel")}
        </Button>
      </div>
    </div>
  );
}
```

`src/features/account/CloseAccountDialog.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useEncerrarConta } from "@/features/account/queries";
import { chaveDeTraducao, extrairErro } from "@/lib/errors";

export default function CloseAccountDialog({
  contaId,
  aberto,
  onFechar,
}: {
  contaId: string;
  aberto: boolean;
  onFechar: () => void;
}) {
  const { t } = useTranslation(["account", "errors"]);
  const encerrar = useEncerrarConta(contaId);
  const navegar = useNavigate();
  const [erro, setErro] = useState<string | null>(null);

  if (!aberto) return null;

  async function aoConfirmar() {
    setErro(null);
    try {
      await encerrar.mutateAsync();
      onFechar();
      navegar("/contas");
    } catch (falha) {
      // O erro fica NO DIALOGO, nao na pagina: fechar aqui esconderia o
      // motivo, e os dois erros possiveis pedem acoes diferentes do usuario
      // — zerar o saldo, ou esperar a transacao pendente resolver.
      setErro(t(chaveDeTraducao(extrairErro(falha).code), { ns: "errors" }));
    }
  }

  return (
    <div role="dialog" aria-label={t("account:close")} className="rounded border p-4">
      <p>{t("account:closeConfirm")}</p>

      {erro !== null && (
        <Alert variant="destructive" role="alert" className="mt-4">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <div className="mt-4 flex gap-2">
        <Button
          variant="destructive"
          onClick={() => void aoConfirmar()}
          disabled={encerrar.isPending}
        >
          {t("account:closeConfirmButton")}
        </Button>
        <Button variant="outline" onClick={onFechar}>
          {t("account:cancel")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Implementar a página de detalhe**

`src/features/account/AccountDetailPage.tsx`:

```tsx
import { useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useConta } from "@/features/account/queries";
import RenameAccountDialog from "@/features/account/RenameAccountDialog";
import CloseAccountDialog from "@/features/account/CloseAccountDialog";
import { formatarDinheiro, paraCentavos } from "@/lib/money";
import { chaveDeTraducao, extrairErro } from "@/lib/errors";

const ROTULO_TIPO = { CHECKING: "account:checking", SAVINGS: "account:savings" } as const;

export default function AccountDetailPage() {
  const { id = "" } = useParams();
  const { t, i18n } = useTranslation(["account", "common", "errors"]);
  const { data: conta, isPending, isError, error } = useConta(id);
  const [renomeando, setRenomeando] = useState(false);
  const [encerrando, setEncerrando] = useState(false);

  if (isPending) return <p>{t("common:loading")}</p>;

  if (isError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>
          {t(chaveDeTraducao(extrairErro(error).code), { ns: "errors" })}
        </AlertDescription>
      </Alert>
    );
  }

  const locale = i18n.resolvedLanguage ?? "pt-BR";

  return (
    <section>
      <h1 className="text-2xl font-semibold">{conta.alias ?? t("account:noAlias")}</h1>
      <p className="text-sm text-muted-foreground">
        {conta.institution.name} · {t("account:branch")} {conta.branch} ·{" "}
        {t("account:number")} {conta.number} · {t(ROTULO_TIPO[conta.type])}
        {conta.status === "CLOSED" ? ` · ${t("account:closed")}` : ""}
      </p>

      <p className="mt-4 text-3xl font-semibold">
        {formatarDinheiro(paraCentavos(conta.balance), locale)}
      </p>

      <div className="mt-4 flex gap-2">
        <Button variant="outline" onClick={() => setRenomeando(true)}>
          {t("account:rename")}
        </Button>
        <Button variant="outline" onClick={() => setEncerrando(true)}>
          {t("account:close")}
        </Button>
      </div>

      <RenameAccountDialog conta={conta} aberto={renomeando} onFechar={() => setRenomeando(false)} />
      <CloseAccountDialog contaId={conta.id} aberto={encerrando} onFechar={() => setEncerrando(false)} />
    </section>
  );
}
```

A linha de processamento e o extrato entram aqui nas Tasks 7 e 8.

- [ ] **Step 8: Rodar e ver passar**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: detalhe da conta com renomear e encerrar

O erro de pendencia tem mensagem distinta da de saldo: confundi-los faria o
usuario zerar a conta e continuar sem conseguir encerrar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Extrato paginado

**Files:**
- Create: `src/features/statement/types.ts`, `src/features/statement/api.ts`, `src/features/statement/queries.ts`, `src/features/statement/StatementRow.tsx`, `src/features/statement/StatementList.tsx`
- Modify: `src/features/account/AccountDetailPage.tsx`, os dois dicionários
- Test: `src/features/statement/StatementList.test.tsx`

**Interfaces:**
- Produces:
  - `type ItemExtrato`, `type PaginaExtrato`, `type Contraparte`
  - `buscarExtrato(contaId: string, cursor: string | null, limit?: number) -> Promise<PaginaExtrato>`
  - `useExtrato(contaId: string)` — `useInfiniteQuery`
  - `StatementList` com `{ contaId: string }`

- [ ] **Step 1: Escrever os tipos**

`src/features/statement/types.ts`:

```ts
import type { Instituicao } from "@/features/account/types";

export type TipoTransacao = "DEPOSIT" | "TRANSFER";
export type StatusTransacao = "PENDING" | "COMPLETED" | "FAILED";
export type Direcao = "IN" | "OUT";

export type Contraparte = {
  /** Ja vem mascarado pelo gateway. Nunca desmascarar no cliente. */
  holder_name: string;
  branch: string;
  number: string;
  institution: Instituicao;
};

export type ItemExtrato = {
  id: string;
  type: TipoTransacao;
  direction: Direcao;
  /** Decimal do Pydantic: string ou numero. */
  amount: string | number;
  status: StatusTransacao;
  is_between_own_accounts: boolean;
  counterparty: Contraparte | null;
  created_at: string;
};

export type PaginaExtrato = {
  items: ItemExtrato[];
  next_cursor: string | null;
};
```

- [ ] **Step 2: Escrever as chaves de tradução**

Em `pt-BR.json`, um espaço `statement`:

```json
"statement": {
  "title": "Extrato",
  "empty": "Nenhuma transação nesta conta ainda.",
  "loadMore": "Carregar mais",
  "noMore": "Não há mais transações",
  "pending": "Em processamento",
  "completed": "Concluída",
  "failed": "Recusada",
  "deposit": "Depósito",
  "ownTransfer": "Entre suas contas"
}
```

Em `en.json`:

```json
"statement": {
  "title": "Statement",
  "empty": "No transactions in this account yet.",
  "loadMore": "Load more",
  "noMore": "No more transactions",
  "pending": "Processing",
  "completed": "Completed",
  "failed": "Declined",
  "deposit": "Deposit",
  "ownTransfer": "Between your accounts"
}
```

Acrescente `"statement"` ao array `ns` em `src/app/i18n.ts`.

- [ ] **Step 3: Escrever o teste que falha**

`src/features/statement/StatementList.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import StatementList from "@/features/statement/StatementList";
import i18n from "@/app/i18n";

const CONTA = "cccccccc-0000-0000-0000-000000000001";

const instituicao = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  code: "001",
  name: "Banco Um",
  color_hex: "#112233",
};

const transferencia = {
  id: "tttttttt-0000-0000-0000-000000000001",
  type: "TRANSFER" as const,
  direction: "OUT" as const,
  amount: "100.00",
  status: "PENDING" as const,
  is_between_own_accounts: false,
  counterparty: {
    holder_name: "M**** S****",
    branch: "0002",
    number: "87654321-0",
    institution: instituicao,
  },
  created_at: "2026-03-09T14:30:00Z",
};

const deposito = {
  id: "tttttttt-0000-0000-0000-000000000002",
  type: "DEPOSIT" as const,
  direction: "IN" as const,
  amount: "250.00",
  status: "COMPLETED" as const,
  is_between_own_accounts: false,
  counterparty: null,
  created_at: "2026-03-08T10:00:00Z",
};

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({
    accessToken: "tok",
    user: null,
    status: "authenticated",
    motivoEncerramento: null,
  });
});

describe("extrato", () => {
  it("mostra transferencia com contraparte mascarada e estado pendente", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${CONTA}/statement`, () =>
        HttpResponse.json({ items: [transferencia], next_cursor: null }),
      ),
    );
    envolverComQuery(<StatementList contaId={CONTA} />);

    expect(await screen.findByText("M**** S****")).toBeInTheDocument();
    expect(screen.getByText("Em processamento")).toBeInTheDocument();
    expect(screen.getByText(/100,00/)).toBeInTheDocument();
  });

  it("deposito aparece sem contraparte", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${CONTA}/statement`, () =>
        HttpResponse.json({ items: [deposito], next_cursor: null }),
      ),
    );
    envolverComQuery(<StatementList contaId={CONTA} />);

    expect(await screen.findByText("Depósito")).toBeInTheDocument();
  });

  it("carregar mais usa o cursor da pagina anterior", async () => {
    // O cursor do gateway e keyset: paginas nao repetem nem pulam item
    // quando algo novo e inserido durante a navegacao. Mandar o cursor
    // errado — ou nenhum — traria a primeira pagina de novo.
    const cursoresRecebidos: (string | null)[] = [];
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${CONTA}/statement`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        cursoresRecebidos.push(cursor);
        return cursor === null
          ? HttpResponse.json({ items: [transferencia], next_cursor: "CURSOR-1" })
          : HttpResponse.json({ items: [deposito], next_cursor: null });
      }),
    );
    envolverComQuery(<StatementList contaId={CONTA} />);
    await screen.findByText("M**** S****");

    await userEvent.click(screen.getByRole("button", { name: "Carregar mais" }));

    expect(await screen.findByText("Depósito")).toBeInTheDocument();
    expect(cursoresRecebidos).toEqual([null, "CURSOR-1"]);
  });

  it("sem proxima pagina o botao some", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${CONTA}/statement`, () =>
        HttpResponse.json({ items: [deposito], next_cursor: null }),
      ),
    );
    envolverComQuery(<StatementList contaId={CONTA} />);
    await screen.findByText("Depósito");

    expect(screen.queryByRole("button", { name: "Carregar mais" })).not.toBeInTheDocument();
  });

  it("conta sem transacoes mostra estado vazio proprio", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${CONTA}/statement`, () =>
        HttpResponse.json({ items: [], next_cursor: null }),
      ),
    );
    envolverComQuery(<StatementList contaId={CONTA} />);

    expect(await screen.findByText("Nenhuma transação nesta conta ainda.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npm test -- StatementList`
Expected: FAIL — os módulos não existem.

- [ ] **Step 5: Implementar a api**

`src/features/statement/api.ts`:

```ts
import { http } from "@/lib/http";
import type { PaginaExtrato } from "@/features/statement/types";

export const LIMITE_MAXIMO = 100;

/**
 * Uma pagina do extrato.
 *
 * O gateway rejeita limit fora de 1..100 com 422 em vez de clampar, entao
 * o valor nunca e passado adiante sem checagem.
 */
export async function buscarExtrato(
  contaId: string,
  cursor: string | null,
  limit?: number,
): Promise<PaginaExtrato> {
  const { data } = await http.get<PaginaExtrato>(`/accounts/${contaId}/statement`, {
    params: {
      ...(cursor === null ? {} : { cursor }),
      ...(limit === undefined ? {} : { limit }),
    },
  });
  return data;
}
```

- [ ] **Step 6: Implementar a consulta**

`src/features/statement/queries.ts`:

```ts
import { useInfiniteQuery } from "@tanstack/react-query";
import { CHAVES } from "@/features/account/queries";
import { buscarExtrato } from "@/features/statement/api";

/**
 * Extrato paginado pelo cursor do gateway.
 *
 * A ordem das propriedades importa: na v5 o TanStack Query infere o tipo do
 * pageParam a partir de queryFn e initialPageParam, e getNextPageParam
 * precisa vir depois. E initialPageParam e OBRIGATORIO na v5 — na v4 ele
 * vinha do valor padrao no destructuring do queryFn, que nao existe mais.
 */
export function useExtrato(contaId: string) {
  return useInfiniteQuery({
    queryKey: CHAVES.extrato(contaId),
    queryFn: ({ pageParam }) => buscarExtrato(contaId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (ultimaPagina) => ultimaPagina.next_cursor,
  });
}
```

- [ ] **Step 7: Implementar a linha do extrato**

`src/features/statement/StatementRow.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import type { ItemExtrato } from "@/features/statement/types";
import { formatarDinheiro, paraCentavos } from "@/lib/money";
import { formatarDataHora } from "@/lib/datetime";

const ROTULO_STATUS = {
  PENDING: "statement:pending",
  COMPLETED: "statement:completed",
  FAILED: "statement:failed",
} as const;

export default function StatementRow({ item }: { item: ItemExtrato }) {
  const { t, i18n } = useTranslation("statement");
  const locale = i18n.resolvedLanguage ?? "pt-BR";
  const centavos = paraCentavos(item.amount);
  const sinal = item.direction === "OUT" ? -1 : 1;

  return (
    <li className="flex items-start justify-between border-b py-3">
      <div>
        {item.counterparty === null ? (
          <p className="font-medium">{t("statement:deposit")}</p>
        ) : (
          <>
            <p className="font-medium">{item.counterparty.holder_name}</p>
            <p className="text-sm text-muted-foreground">
              {item.counterparty.institution.name} · {item.counterparty.branch} ·{" "}
              {item.counterparty.number}
            </p>
          </>
        )}
        {item.is_between_own_accounts && (
          <p className="text-sm text-muted-foreground">{t("statement:ownTransfer")}</p>
        )}
        <p className="text-sm text-muted-foreground">
          {formatarDataHora(item.created_at, locale)} · {t(ROTULO_STATUS[item.status])}
        </p>
      </div>
      <p className="font-semibold">{formatarDinheiro(sinal * centavos, locale)}</p>
    </li>
  );
}
```

- [ ] **Step 8: Implementar a lista**

`src/features/statement/StatementList.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import StatementRow from "@/features/statement/StatementRow";
import { useExtrato } from "@/features/statement/queries";
import { chaveDeTraducao, extrairErro } from "@/lib/errors";

export default function StatementList({ contaId }: { contaId: string }) {
  const { t } = useTranslation(["statement", "common", "errors"]);
  const {
    data,
    isPending,
    isError,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useExtrato(contaId);

  if (isPending) return <p>{t("common:loading")}</p>;

  if (isError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>
          {t(chaveDeTraducao(extrairErro(error).code), { ns: "errors" })}
        </AlertDescription>
      </Alert>
    );
  }

  const itens = data.pages.flatMap((pagina) => pagina.items);

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{t("statement:title")}</h2>

      {itens.length === 0 ? (
        <p className="mt-4 text-muted-foreground">{t("statement:empty")}</p>
      ) : (
        <ul className="mt-4">
          {itens.map((item) => (
            <StatementRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      {/* O botao so existe quando ha proxima pagina: um botao permanente que
          nao faz nada e pior do que nenhum botao. */}
      {hasNextPage && (
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {t("statement:loadMore")}
        </Button>
      )}
    </section>
  );
}
```

- [ ] **Step 9: Ligar no detalhe**

Em `AccountDetailPage.tsx`, renderizar `<StatementList contaId={conta.id} />` logo antes do fechamento da `<section>`, depois dos diálogos.

- [ ] **Step 10: Rodar e ver passar**

Run: `npm test`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: extrato paginado pelo cursor do gateway

useInfiniteQuery com initialPageParam explicito — na v5 ele e obrigatorio, e
o valor padrao no destructuring do queryFn deixou de funcionar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: A linha de processamento

O item de maior risco da fatia: o número que a tela mostra sobre quanto dá para gastar.

**Files:**
- Create: `src/features/statement/PendingBalanceLine.tsx`
- Modify: `src/features/statement/queries.ts`, `src/features/account/AccountDetailPage.tsx`, os dois dicionários
- Test: `src/features/statement/PendingBalanceLine.test.tsx`

**Interfaces:**
- Produces: `usePendentesDeSaida(contaId: string)` — devolve `{ centavos: number, isPending: boolean }`; `PendingBalanceLine` com `{ contaId: string, saldo: string | number }`.

- [ ] **Step 1: Acrescentar as chaves de tradução**

Em `statement` de `pt-BR.json`: `"processing": "Em processamento"`, `"available": "Disponível"`.
Em `en.json`: `"processing": "Processing"`, `"available": "Available"`.

(`processing` já existe como `pending`; use uma chave própria para a linha, porque o texto pode divergir do rótulo de status.)

- [ ] **Step 2: Escrever o teste que falha**

`src/features/statement/PendingBalanceLine.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import PendingBalanceLine from "@/features/statement/PendingBalanceLine";
import i18n from "@/app/i18n";

const CONTA = "cccccccc-0000-0000-0000-000000000001";

function item(over: Partial<Record<string, unknown>>) {
  return {
    id: crypto.randomUUID(),
    type: "TRANSFER",
    direction: "OUT",
    amount: "10.00",
    status: "PENDING",
    is_between_own_accounts: false,
    counterparty: null,
    created_at: "2026-03-09T14:30:00Z",
    ...over,
  };
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({
    accessToken: "tok",
    user: null,
    status: "authenticated",
    motivoEncerramento: null,
  });
});

describe("linha de processamento", () => {
  it("soma apenas saidas pendentes", async () => {
    // Entrada pendente nao reduz o disponivel — o dinheiro esta CHEGANDO.
    // Saida concluida ja saiu do saldo. Somar qualquer um dos dois daria um
    // disponivel menor que o real.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${CONTA}/statement`, () =>
        HttpResponse.json({
          items: [
            item({ direction: "OUT", status: "PENDING", amount: "0.10" }),
            item({ direction: "OUT", status: "PENDING", amount: "0.20" }),
            item({ direction: "IN", status: "PENDING", amount: "999.00" }),
            item({ direction: "OUT", status: "COMPLETED", amount: "999.00" }),
            item({ direction: "OUT", status: "FAILED", amount: "999.00" }),
          ],
          next_cursor: null,
        }),
      ),
    );

    envolverComQuery(<PendingBalanceLine contaId={CONTA} saldo="500.00" />);

    // 0.10 + 0.20 em ponto flutuante daria 0.30000000000000004.
    expect(await screen.findByText(/0,30/)).toBeInTheDocument();
    expect(screen.queryByText(/0000/)).not.toBeInTheDocument();
    expect(screen.getByText(/499,70/)).toBeInTheDocument();
  });

  it("pede exatamente 100 itens, o teto do gateway", async () => {
    let limiteRecebido: string | null = null;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${CONTA}/statement`, ({ request }) => {
        limiteRecebido = new URL(request.url).searchParams.get("limit");
        return HttpResponse.json({ items: [], next_cursor: null });
      }),
    );

    envolverComQuery(<PendingBalanceLine contaId={CONTA} saldo="500.00" />);

    await screen.findByTestId("sem-pendencias");
    expect(limiteRecebido).toBe("100");
  });

  it("sem saidas pendentes a linha nao aparece", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${CONTA}/statement`, () =>
        HttpResponse.json({ items: [], next_cursor: null }),
      ),
    );

    envolverComQuery(<PendingBalanceLine contaId={CONTA} saldo="500.00" />);

    await screen.findByTestId("sem-pendencias");
    expect(screen.queryByText("Em processamento")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -- PendingBalanceLine`
Expected: FAIL — o componente não existe.

- [ ] **Step 4: Implementar a consulta dedicada**

Em `src/features/statement/queries.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { buscarExtrato, LIMITE_MAXIMO } from "@/features/statement/api";
import { paraCentavos, somarCentavos } from "@/lib/money";

/**
 * Soma das saidas PENDING, para derivar o saldo disponivel.
 *
 * O gateway calcula "disponivel = saldo - saidas pendentes" apenas dentro da
 * validacao de transferencia, e so o revela no details do erro
 * INSUFFICIENT_FUNDS. O AccountOut traz somente balance.
 *
 * FURO CONHECIDO E ACEITO (secao 6 do spec): PENDING nao e necessariamente
 * recente. Uma transacao presa porque o worker caiu fica pendente por horas,
 * e transacoes mais novas podem empurra-la para alem das 100 primeiras — ai
 * o disponivel exibido fica MAIOR que o real, exatamente quando o numero
 * mais importa. O extrato nao aceita filtro por status, entao nao ha
 * consulta barata que resolva. A correcao definitiva e expor o campo no
 * gateway; esta registrada nos follow-ups.
 */
export function usePendentesDeSaida(contaId: string) {
  const consulta = useQuery({
    queryKey: CHAVES.extratoPendentes(contaId),
    queryFn: () => buscarExtrato(contaId, null, LIMITE_MAXIMO),
  });

  const centavos = somarCentavos(
    (consulta.data?.items ?? [])
      // Entrada pendente nao reduz o disponivel: o dinheiro esta chegando.
      // Saida concluida ja saiu do saldo. So a saida pendente esta reservada.
      .filter((i) => i.direction === "OUT" && i.status === "PENDING")
      .map((i) => paraCentavos(i.amount)),
  );

  return { centavos, isPending: consulta.isPending };
}
```

Acrescente o import de `CHAVES` de `@/features/account/queries`.

- [ ] **Step 5: Implementar o componente**

`src/features/statement/PendingBalanceLine.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { formatarDinheiro, paraCentavos } from "@/lib/money";
import { usePendentesDeSaida } from "@/features/statement/queries";

export default function PendingBalanceLine({
  contaId,
  saldo,
}: {
  contaId: string;
  saldo: string | number;
}) {
  const { t, i18n } = useTranslation("statement");
  const { centavos, isPending } = usePendentesDeSaida(contaId);
  const locale = i18n.resolvedLanguage ?? "pt-BR";

  if (isPending) return null;
  if (centavos === 0) return <span data-testid="sem-pendencias" hidden />;

  const disponivel = paraCentavos(saldo) - centavos;

  return (
    <dl className="mt-2 text-sm">
      <div className="flex justify-between">
        <dt>{t("statement:processing")}</dt>
        <dd>-{formatarDinheiro(centavos, locale)}</dd>
      </div>
      <div className="flex justify-between font-medium">
        <dt>{t("statement:available")}</dt>
        <dd>{formatarDinheiro(disponivel, locale)}</dd>
      </div>
    </dl>
  );
}
```

- [ ] **Step 6: Ligar no detalhe**

Em `AccountDetailPage.tsx`, abaixo do saldo: `<PendingBalanceLine contaId={conta.id} saldo={conta.balance} />`.

- [ ] **Step 7: Rodar e ver passar**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Provar que o filtro é o que segura**

Remova `&& i.status === "PENDING"` do filtro e rode `npm test -- PendingBalanceLine`.
Expected: FAIL em `soma apenas saidas pendentes`. **Restaure**, remova agora `i.direction === "OUT" &&`, rode de novo e confirme que também falha. **Restaure** e confirme o verde.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: linha de processamento com o disponivel derivado

Soma so as saidas PENDING: entrada pendente nao reduz o disponivel porque o
dinheiro esta chegando, e saida concluida ja saiu do saldo.

O furo esta documentado no codigo — PENDING nao e necessariamente recente, e
uma transacao presa pode cair fora das 100 primeiras.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Rotas, navegação, ponta a ponta e documentação

**Files:**
- Modify: `src/app/router.tsx`, `src/components/layout/AppShell.tsx`, `README.md`
- Create: `tests/e2e/contas.spec.ts`, `docs/superpowers/follow-ups-fatia-3b.md`
- Test: `src/app/router.test.tsx` (acrescentar casos)

**Interfaces:**
- Consumes: `AccountsPage`, `AccountDetailPage`.

- [ ] **Step 1: Acrescentar as rotas**

Em `src/app/router.tsx`, dentro do bloco autenticado, acrescentar `/contas` e `/contas/:id` envolvidas pelo `AppShell`, seguindo exatamente o padrão da rota `/` que já existe.

- [ ] **Step 2: Acrescentar a navegação**

Em `src/components/layout/AppShell.tsx`, um `NavLink` para `/contas` rotulado por uma chave nova `common:accounts` — `"Contas"` em pt-BR, `"Accounts"` em en.

**Cuidado com uma armadilha da 3a:** o rótulo do item de navegação e o título da página não podem ser buscados por `getByText` nos testes quando forem iguais, porque aparecem duas vezes. Use `getByRole("heading", { name })` para o título, como os testes do roteador já fazem.

- [ ] **Step 3: Acrescentar os casos de rota**

Em `src/app/router.test.tsx`, dois casos: navegar para `/contas` mostra o título da lista, e `/contas/:id` inexistente mostra a mensagem de não encontrada. Ambos com `getByRole("heading", ...)` para o título.

- [ ] **Step 4: Escrever o teste de ponta a ponta**

`tests/e2e/contas.spec.ts`:

```ts
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
```

- [ ] **Step 5: Rodar os testes de ponta a ponta**

Com o Postgres e o gateway no ar:

```bash
npm run e2e
```

Expected: os testes de conta passam, junto com os de autenticação da 3a.

- [ ] **Step 6: Atualizar o README**

Acrescentar uma seção curta sobre o estado de servidor: que o TanStack Query cuida dos dados do servidor e o Zustand da sessão, que nada é copiado entre os dois, que `refetchOnWindowFocus` está desligado de propósito, e onde ficam as chaves de cache (`src/features/account/queries.ts`).

- [ ] **Step 7: Escrever os follow-ups**

`docs/superpowers/follow-ups-fatia-3b.md`:

```markdown
# Follow-ups da Fatia 3b

## Precisa sair antes da Fatia 4 (deploy)

### O saldo disponível pode ficar maior que o real

`src/features/statement/queries.ts` deriva o disponível somando as saídas
`PENDING` das 100 transações mais recentes. `PENDING` não é necessariamente
recente: uma transação presa porque o worker caiu fica pendente por horas, e
transações mais novas podem empurrá-la para fora dessa janela. O extrato não
aceita filtro por status.

**A correção definitiva é no gateway:** expor `available_balance` em
`AccountOut`. O cálculo já existe lá — `TransactionService.request_transfer`
faz `balance - sum_pending_outgoing`. Um campo computado resolveria para
qualquer cliente futuro.

## Dívida conhecida

### A persistência do idioma continua sem teste

Herdado da Fatia 3a. A troca de idioma é testada; que a escolha sobreviva ao
recarregamento não.

### O extrato não tem filtro

Nem por período, nem por status, nem por direção. O gateway não oferece, e
para uma conta com muitas transações a navegação vira só "carregar mais".
```

- [ ] **Step 8: Rodar tudo e commitar**

```bash
npm test && npm run build
git add -A
git commit -m "feat: rotas de conta, navegacao, ponta a ponta e follow-ups

O CPF do teste e gerado com digitos verificadores calculados: a suite
anterior sorteava entre dois fixos e falhava na segunda execucao contra o
mesmo banco.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verificação final da fatia

Os critérios de aceitação do spec §11, e onde cada um é coberto:

| # | Critério | Coberto por |
|---|---|---|
| 1 | Abrir conta e ela aparece na lista | Task 5, `cria a conta e REFAZ a lista` — com mutação obrigatória no Step 8 |
| 2 | Limite de contas com mensagem própria | Task 5, `limite de contas mostra a mensagem propria` |
| 3 | Renomear altera o apelido | Task 6, `renomear atualiza o apelido na tela` |
| 4 | Encerrar com saldo mostra a mensagem de saldo | Task 6 |
| 5 | Encerrar com pendência mostra mensagem distinta | Task 6, `mensagem DISTINTA da de saldo` |
| 6 | Conta encerrada some da lista, detalhe acessível | **lacuna parcial** — ver abaixo |
| 7 | Extrato com direção, valor, data, status, contraparte | Task 7 |
| 8 | Carregar mais sem repetir nem pular | Task 7, `carregar mais usa o cursor da pagina anterior` |
| 9 | Estado vazio próprio | Task 7 |
| 10 | Linha de processamento aparece e some | Task 8 |
| 11 | Soma exata com valores que quebram em float | Task 2 e Task 8, ambas com mutação obrigatória |
| 12 | Trocar idioma reformata sem nova requisição | Task 4, `trocar o idioma reformata o valor sem nova requisicao` |
| 13 | Conta alheia diz "não encontrada" | Task 6, e a asserção negativa de que não fala em permissão |

**Cobertura parcial declarada no critério 6.** Os testes cobrem que encerrar chama o servidor e invalida as consultas, mas nenhum verifica o ciclo completo — que a conta sai da listagem *e* continua acessível pelo detalhe com status encerrado. Fechar isso exige um teste que encadeie as duas telas, ou um caminho no Playwright. Se não for feito, registre em `follow-ups-fatia-3b.md` como cobertura ausente — **não** o declare coberto.
