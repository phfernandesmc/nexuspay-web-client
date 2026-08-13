# Fatia 3c — Contatos, transferência e depósito

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar as telas que movem dinheiro — contatos, transferência, depósito — e o recibo que acompanha uma transação que o servidor aceitou mas ainda não concluiu.

**Architecture:** Dois domínios novos (`contact` e `transaction`) ao lado do `account` que a 3b entregou, cada um com `types.ts`, `api.ts` e `queries.ts`. A `Idempotency-Key` vive num hook próprio, isolado e testável sem tela. O recibo tem rota própria para sobreviver ao recarregamento, já que a chave não é persistida.

**Tech Stack:** React 19, Vite 8, TypeScript 7, Tailwind 4, shadcn, TanStack Query 5, Axios, i18next, Vitest com MSW, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-13-fatia-3c-contatos-transferencia-deposito-design.md`

## Global Constraints

- **Nenhuma string visível fora do i18next.** Toda chave nova entra nos **dois** dicionários, `src/locales/pt-BR.json` e `src/locales/en.json`. Chave presente num e ausente no outro é defeito.
- **Erro traduzido por código, nunca pela mensagem do servidor.** O padrão é `t(codigoTraduzivel(extrairErro(falha).code), { ns: "errors" })`. Use `codigoTraduzivel`, **nunca** `chaveDeTraducao` — esta já devolve o prefixo `errors.` e somada a `{ ns: "errors" }` mostraria a chave crua na tela.
- **Nunca renderize `error.message`, `reason` ou `failure_reason` do servidor.**
- **Dinheiro em centavos inteiros**, via `paraCentavos`, `somarCentavos` e `formatarDinheiro` de `@/lib/money`. Nunca reimplemente formatação nem soma. Datas via `formatarDataHora` de `@/lib/datetime`.
- **A formatação segue o idioma, a moeda não** — sempre `BRL`.
- **Nenhum estado otimista. Nenhum polling. Nenhum timer.**
- **Chaves de cache sempre pelo registro `CHAVES`**, nunca array literal escrito à mão.
- **Diálogos são montados condicionalmente** (`{aberto && <Dialog … />}`), nunca com `if (!aberto) return null` depois dos `useState` — na 3b isso fez erro de saldo reaparecer sozinho ao reabrir.
- **Toda chave de erro nova precisa entrar em `CODIGOS_DE_ERRO`** em `src/lib/errors.ts`, senão `codigoTraduzivel` devolve `UNKNOWN`.
- Commits em português, formato `tipo: descrição`, terminando com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **A fila SQS `api-processar-transferencia-worker.fifo` é compartilhada entre desenvolvimento e produção.** O e2e desta fatia publica nela por natureza; só pode rodar contra o ambiente local, com dados próprios por execução.

## Estrutura de arquivos

**Domínio de contato** (`src/features/contact/`):
- `types.ts` — `Contato`, `ContaAlvo`, `ResultadoBusca`
- `api.ts` — `listarContatos`, `buscarContaPorDados`, `salvarContato`, `atualizarContato`, `removerContato`
- `queries.ts` — `useContatos`, `useBuscarConta`, `useSalvarContato`, `useAtualizarContato`, `useRemoverContato`
- `ContactsPage.tsx` — a lista, favoritos primeiro
- `ContactRow.tsx` — uma linha, com favoritar / renomear / remover
- `AddContactDialog.tsx` — o fluxo de dois passos
- `AccountLookup.tsx` — o formulário de busca reutilizado por contatos **e** por transferência

**Domínio de transação** (`src/features/transaction/`):
- `types.ts` — `Transacao`, `TipoTransacao`, `StatusTransacao`, `MotivoFalha`, `RespostaTransacao`
- `api.ts` — `transferir`, `depositar`, `buscarTransacao`
- `queries.ts` — `useTransacao`, `useTransferir`, `useDepositar`
- `idempotency.ts` — `useChaveDeIntencao`
- `TransferPage.tsx`, `DepositPage.tsx`, `TransactionReceiptPage.tsx`

**Modificados:** `src/features/account/queries.ts` (novas chaves), `src/lib/errors.ts` (motivos de falha), `src/app/router.tsx`, `src/app/i18n.ts`, `src/components/layout/AppShell.tsx`, os dois dicionários.

---

### Task 1: Tipos, camada de API e chaves de cache

**Files:**
- Create: `src/features/contact/types.ts`, `src/features/contact/api.ts`, `src/features/transaction/types.ts`, `src/features/transaction/api.ts`
- Modify: `src/features/account/queries.ts` (acrescentar chaves ao registro `CHAVES`)
- Test: `src/features/contact/api.test.ts`

**Interfaces:**
- Consumes: `http` de `@/lib/http`; `Instituicao`, `TipoConta`, `StatusConta` de `@/features/account/types`.
- Produces: os tipos e funções abaixo, mais `CHAVES.contatos()`, `CHAVES.transacao(id)`.

- [ ] **Step 1: Escreva os tipos de contato**

Crie `src/features/contact/types.ts`:

```ts
import type { Instituicao, StatusConta, TipoConta } from "@/features/account/types";

/** A conta de destino como o gateway a devolve dentro de um contato. */
export type ContaAlvo = {
  id: string;
  branch: string;
  number: string;
  /** Ja vem mascarado pelo gateway. Nao mascare de novo nem revele mais. */
  holder_name: string;
  type: TipoConta;
  status: StatusConta;
  institution: Instituicao;
};

export type Contato = {
  id: string;
  alias: string;
  is_favorite: boolean;
  target_account: ContaAlvo;
  created_at: string;
};

/** O que POST /contacts/lookup devolve. Nao tem id de contato: ainda nao existe contato. */
export type ResultadoBusca = {
  account_id: string;
  holder_name: string;
  type: TipoConta;
  institution: Instituicao;
};

export type DadosDaBusca = {
  institution_id: string;
  branch: string;
  number: string;
};
```

- [ ] **Step 2: Escreva os tipos de transação**

Crie `src/features/transaction/types.ts`:

```ts
export type TipoTransacao = "DEPOSIT" | "TRANSFER";
export type StatusTransacao = "PENDING" | "COMPLETED" | "FAILED";

/**
 * Conjunto FECHADO de tres valores, definido no enum FailureReason do worker.
 * Nao e texto livre: o worker o criou assim para o frontend traduzir por
 * codigo. Um valor fora desta lista cai na mensagem generica.
 */
export const MOTIVOS_DE_FALHA = [
  "INSUFFICIENT_FUNDS",
  "SOURCE_ACCOUNT_UNAVAILABLE",
  "DESTINATION_ACCOUNT_UNAVAILABLE",
] as const;

export type MotivoFalha = (typeof MOTIVOS_DE_FALHA)[number];

export type Transacao = {
  id: string;
  type: TipoTransacao;
  status: StatusTransacao;
  /** Decimal do Pydantic: string ou numero. Use paraCentavos de @/lib/money. */
  amount: string | number;
  source_account_id: string | null;
  destination_account_id: string;
  failure_reason: string | null;
  created_at: string;
};

/**
 * O gateway devolve 202 quando CRIA a transacao e 200 quando a
 * Idempotency-Key ja tinha sido usada e ele esta reapresentando a que existe.
 * A interface precisa dizer coisas diferentes nos dois casos, entao o status
 * viaja junto com o corpo em vez de ser descartado.
 */
export type RespostaTransacao = {
  transacao: Transacao;
  /** true quando o gateway respondeu 202. */
  criadaAgora: boolean;
};
```

- [ ] **Step 3: Escreva o teste da camada de API de contato**

Crie `src/features/contact/api.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { buscarContaPorDados, salvarContato } from "@/features/contact/api";

describe("api de contato", () => {
  it("manda os tres campos da busca no corpo", async () => {
    let corpoRecebido: unknown = null;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/contacts/lookup`, async ({ request }) => {
        corpoRecebido = await request.json();
        return HttpResponse.json({
          account_id: "conta-1",
          holder_name: "M**** S****",
          type: "CHECKING",
          institution: { id: "inst-1", code: "001", name: "Banco Um", color_hex: "#112233" },
        });
      }),
    );

    const achada = await buscarContaPorDados({
      institution_id: "inst-1",
      branch: "0001",
      number: "12345678",
    });

    expect(corpoRecebido).toEqual({
      institution_id: "inst-1",
      branch: "0001",
      number: "12345678",
    });
    expect(achada.holder_name).toBe("M**** S****");
  });

  it("salva o contato com o account_id que a busca devolveu, nao com os dados da busca", async () => {
    // Esta e a razao do fluxo de dois passos existir: o gateway so aceita
    // account_id, e ele so vem do lookup. Mandar branch/number aqui seria
    // 422, e o teste falha se alguem tentar pular o primeiro passo.
    let corpoRecebido: unknown = null;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/contacts`, async ({ request }) => {
        corpoRecebido = await request.json();
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    await salvarContato({ account_id: "conta-1", alias: "Maria", is_favorite: false });

    expect(corpoRecebido).toEqual({
      account_id: "conta-1",
      alias: "Maria",
      is_favorite: false,
    });
  });
});
```

- [ ] **Step 4: Rode o teste e confirme que falha**

Run: `npm test -- --run src/features/contact/api.test.ts`
Expected: FAIL, `Failed to resolve import "@/features/contact/api"`.

- [ ] **Step 5: Escreva a camada de API de contato**

Crie `src/features/contact/api.ts`:

```ts
import { http } from "@/lib/http";
import type { Contato, DadosDaBusca, ResultadoBusca } from "@/features/contact/types";

export async function listarContatos(): Promise<Contato[]> {
  const { data } = await http.get<Contato[]>("/contacts");
  return data;
}

/**
 * Primeiro passo do fluxo de dois passos. Devolve o titular para o usuario
 * CONFERIR antes de qualquer gravacao — e o unico ponto em que ele ve para
 * quem o dinheiro vai antes de mandar.
 */
export async function buscarContaPorDados(dados: DadosDaBusca): Promise<ResultadoBusca> {
  const { data } = await http.post<ResultadoBusca>("/contacts/lookup", dados);
  return data;
}

export async function salvarContato(entrada: {
  account_id: string;
  alias: string;
  is_favorite: boolean;
}): Promise<Contato> {
  const { data } = await http.post<Contato>("/contacts", entrada);
  return data;
}

export async function atualizarContato(
  id: string,
  mudanca: { alias?: string; is_favorite?: boolean },
): Promise<Contato> {
  const { data } = await http.patch<Contato>(`/contacts/${id}`, mudanca);
  return data;
}

export async function removerContato(id: string): Promise<void> {
  await http.delete(`/contacts/${id}`);
}
```

- [ ] **Step 6: Escreva a camada de API de transação**

Crie `src/features/transaction/api.ts`:

```ts
import { http } from "@/lib/http";
import type { RespostaTransacao, Transacao } from "@/features/transaction/types";

/**
 * 202 = criada agora. 200 = a Idempotency-Key ja tinha sido usada e o
 * gateway esta reapresentando a transacao que ja existe. Descartar essa
 * diferenca faria a tela dizer "enviada" para um reenvio que nao enviou nada.
 */
function comOrigem(status: number, transacao: Transacao): RespostaTransacao {
  return { transacao, criadaAgora: status === 202 };
}

export async function transferir(
  entrada: { source_account_id: string; destination_account_id: string; amount: string },
  chave: string,
): Promise<RespostaTransacao> {
  const resposta = await http.post<Transacao>("/transactions/transfer", entrada, {
    headers: { "Idempotency-Key": chave },
  });
  return comOrigem(resposta.status, resposta.data);
}

export async function depositar(
  entrada: { account_id: string; amount: string },
  chave: string,
): Promise<RespostaTransacao> {
  const resposta = await http.post<Transacao>("/transactions/deposit", entrada, {
    headers: { "Idempotency-Key": chave },
  });
  return comOrigem(resposta.status, resposta.data);
}

export async function buscarTransacao(id: string): Promise<Transacao> {
  const { data } = await http.get<Transacao>(`/transactions/${id}`);
  return data;
}
```

- [ ] **Step 7: Acrescente as chaves de cache**

Em `src/features/account/queries.ts`, dentro do objeto `CHAVES`, acrescente duas entradas depois de `instituicoes`:

```ts
  instituicoes: () => ["instituicoes"] as const,
  contatos: () => ["contatos"] as const,
  transacao: (id: string) => ["transacao", id] as const,
};
```

- [ ] **Step 8: Rode os testes e confirme que passam**

Run: `npm test -- --run`
Expected: PASS, 122 testes (120 anteriores + 2 novos).

- [ ] **Step 9: Commit**

```bash
git add src/features/contact src/features/transaction src/features/account/queries.ts
git commit -m "feat: tipos e camada de api de contatos e transacoes

O 202 e o 200 viajam junto com o corpo em RespostaTransacao: descartar essa
diferenca faria a tela dizer que enviou algo quando so reapresentou o que ja
existia.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: A chave de idempotência

**Files:**
- Create: `src/features/transaction/idempotency.ts`
- Test: `src/features/transaction/idempotency.test.ts`

**Interfaces:**
- Consumes: nada além do React.
- Produces: `useChaveDeIntencao(payload: unknown): string` — devolve a mesma chave enquanto o payload não mudar, e uma chave nova quando ele mudar. E `limparChave(): void` no mesmo retorno.

**Contexto que o implementador precisa.** O gateway exige o cabeçalho `Idempotency-Key` em transferência e depósito. A regra, decidida pelo dono do projeto e registrada na §10 do spec: a chave é gerada por **intenção** e fica presa ao payload que a originou. Reenviar o mesmo payload — porque a rede caiu, porque o usuário clicou duas vezes — manda a mesma chave, e o gateway devolve `200` com a transação que já existe em vez de criar outra. Alterar qualquer campo descarta a chave e gera outra, porque virou outra intenção. Sucesso limpa. Ela **não** é persistida.

- [ ] **Step 1: Escreva o teste**

Crie `src/features/transaction/idempotency.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChaveDeIntencao } from "@/features/transaction/idempotency";

describe("chave de intencao", () => {
  it("devolve a MESMA chave enquanto o payload nao muda", () => {
    // Este e o teste que protege contra a transferencia duplicada: se a
    // chave mudasse a cada render, um clique duplo criaria duas transacoes.
    const { result, rerender } = renderHook(
      ({ p }) => useChaveDeIntencao(p),
      { initialProps: { p: { conta: "a", valor: "10.00" } } },
    );
    const primeira = result.current.chave;

    rerender({ p: { conta: "a", valor: "10.00" } });

    expect(result.current.chave).toBe(primeira);
  });

  it("gera chave NOVA quando qualquer campo muda", () => {
    const { result, rerender } = renderHook(
      ({ p }) => useChaveDeIntencao(p),
      { initialProps: { p: { conta: "a", valor: "10.00" } } },
    );
    const primeira = result.current.chave;

    rerender({ p: { conta: "a", valor: "10.01" } });

    expect(result.current.chave).not.toBe(primeira);
  });

  it("limpar gera chave nova para o mesmo payload", () => {
    // Depois do sucesso a intencao acabou. Reusar a chave faria o proximo
    // envio identico ser tratado como reenvio, e o gateway devolveria a
    // transacao antiga em vez de mandar dinheiro de novo.
    const { result } = renderHook(() => useChaveDeIntencao({ conta: "a", valor: "10.00" }));
    const primeira = result.current.chave;

    act(() => result.current.limparChave());

    expect(result.current.chave).not.toBe(primeira);
  });

  it("a chave e um UUID", () => {
    const { result } = renderHook(() => useChaveDeIntencao({ conta: "a" }));
    expect(result.current.chave).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("ordem diferente das mesmas chaves NAO muda a intencao", () => {
    // Um objeto com as mesmas entradas em ordem diferente e o mesmo payload.
    // Sem ordenacao, JSON.stringify daria strings diferentes e a chave
    // trocaria sem o usuario ter mudado nada.
    const { result, rerender } = renderHook(
      ({ p }) => useChaveDeIntencao(p),
      { initialProps: { p: { a: "1", b: "2" } as Record<string, string> } },
    );
    const primeira = result.current.chave;

    rerender({ p: { b: "2", a: "1" } });

    expect(result.current.chave).toBe(primeira);
  });
});
```

- [ ] **Step 2: Rode o teste e confirme que falha**

Run: `npm test -- --run src/features/transaction/idempotency.test.ts`
Expected: FAIL, `Failed to resolve import "@/features/transaction/idempotency"`.

- [ ] **Step 3: Escreva o hook**

Crie `src/features/transaction/idempotency.ts`:

```ts
import { useCallback, useRef, useState } from "react";

/**
 * Serializa o payload de forma estavel: as chaves saem em ordem alfabetica,
 * entao { a, b } e { b, a } produzem a mesma string. Sem isso, remontar o
 * objeto numa ordem diferente trocaria a chave de idempotencia sem o
 * usuario ter mudado campo nenhum.
 */
function assinatura(payload: unknown): string {
  return JSON.stringify(payload, (_chave, valor: unknown) => {
    if (valor && typeof valor === "object" && !Array.isArray(valor)) {
      const entradas = Object.entries(valor as Record<string, unknown>);
      entradas.sort(([a], [b]) => a.localeCompare(b));
      return Object.fromEntries(entradas);
    }
    return valor;
  });
}

/**
 * A Idempotency-Key da intencao atual.
 *
 * Presa ao payload: enquanto ele nao mudar, a mesma chave volta. Reenviar
 * depois de uma falha de rede manda a mesma chave, e o gateway devolve 200
 * com a transacao que ja existe em vez de criar outra. Mudar qualquer campo
 * torna a intencao outra, e a chave e descartada.
 *
 * NAO e persistida: recarregar a pagina a perde, e isso e aceito porque o
 * recibo em /transacoes/:id responde "passou?" sem depender dela.
 */
export function useChaveDeIntencao(payload: unknown): {
  chave: string;
  limparChave: () => void;
} {
  const atual = assinatura(payload);
  const assinaturaRef = useRef(atual);
  const [chave, setChave] = useState(() => crypto.randomUUID());

  if (assinaturaRef.current !== atual) {
    assinaturaRef.current = atual;
    // Gerar durante o render e seguro aqui: o valor deriva do payload, e o
    // React re-renderiza com o estado novo sem efeito colateral externo.
    setChave(crypto.randomUUID());
  }

  const limparChave = useCallback(() => {
    setChave(crypto.randomUUID());
  }, []);

  return { chave, limparChave };
}
```

- [ ] **Step 4: Rode o teste e confirme que passa**

Run: `npm test -- --run src/features/transaction/idempotency.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 5: Prove que os testes discriminam**

Troque, temporariamente, o corpo de `useChaveDeIntencao` para devolver `crypto.randomUUID()` a cada render:

```ts
  return { chave: crypto.randomUUID(), limparChave: () => {} };
```

Run: `npm test -- --run src/features/transaction/idempotency.test.ts`
Expected: FAIL — `devolve a MESMA chave enquanto o payload nao muda` e `ordem diferente das mesmas chaves NAO muda a intencao` falham.

**Restaure o arquivo** e rode de novo. Expected: PASS, 5 testes.

- [ ] **Step 6: Commit**

```bash
git add src/features/transaction/idempotency.ts src/features/transaction/idempotency.test.ts
git commit -m "feat: chave de idempotencia presa ao payload da intencao

A serializacao ordena as chaves do objeto: sem isso, remontar o payload numa
ordem diferente trocaria a chave sem o usuario ter mudado nada, e o clique
duplo voltaria a criar duas transacoes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Contatos — buscar uma conta e salvar

**Files:**
- Create: `src/features/contact/queries.ts`, `src/features/contact/AccountLookup.tsx`, `src/features/contact/AddContactDialog.tsx`
- Modify: `src/locales/pt-BR.json`, `src/locales/en.json`, `src/app/i18n.ts`
- Test: `src/features/contact/AddContactDialog.test.tsx`

**Interfaces:**
- Consumes: `buscarContaPorDados`, `salvarContato` de `@/features/contact/api`; `ResultadoBusca`, `DadosDaBusca` de `@/features/contact/types`; `useInstituicoes` e `CHAVES` de `@/features/account/queries`.
- Produces:
  - `useBuscarConta()` — mutação que devolve `ResultadoBusca`
  - `useSalvarContato()` — mutação que invalida `CHAVES.contatos()`
  - `<AccountLookup onEncontrada={(r: ResultadoBusca) => void} />` — o formulário de busca, **reutilizado pela transferência na Task 7**
  - `<AddContactDialog aberto={boolean} onFechar={() => void} />`

**Por que dois passos.** `POST /contacts` exige `account_id`, e o único jeito de obtê-lo é `POST /contacts/lookup`. O passo intermediário não é burocracia: é onde o usuário lê o nome de quem vai receber o dinheiro antes de qualquer gravação. O `holder_name` já vem mascarado do gateway — exiba o que veio, não mascare de novo nem revele mais.

- [ ] **Step 1: Acrescente as chaves de tradução**

Em `src/locales/pt-BR.json`, acrescente um bloco `contact` no nível raiz:

```json
  "contact": {
    "title": "Contatos",
    "add": "Adicionar contato",
    "addTitle": "Adicionar contato",
    "institution": "Instituição",
    "branch": "Agência",
    "number": "Número da conta",
    "search": "Buscar",
    "searching": "Buscando...",
    "found": "Conta encontrada",
    "holder": "Titular",
    "alias": "Apelido",
    "save": "Salvar contato",
    "saving": "Salvando...",
    "cancel": "Cancelar",
    "searchAgain": "Buscar outra conta",
    "empty": "Você ainda não tem contatos.",
    "favorite": "Favoritar",
    "unfavorite": "Desfavoritar",
    "rename": "Renomear",
    "remove": "Remover",
    "removeConfirm": "Remover este contato? Isso não afeta transferências já feitas.",
    "removeConfirmButton": "Remover"
  },
```

Em `src/locales/en.json`, o mesmo bloco com os mesmos nomes de chave:

```json
  "contact": {
    "title": "Contacts",
    "add": "Add contact",
    "addTitle": "Add contact",
    "institution": "Institution",
    "branch": "Branch",
    "number": "Account number",
    "search": "Search",
    "searching": "Searching...",
    "found": "Account found",
    "holder": "Holder",
    "alias": "Nickname",
    "save": "Save contact",
    "saving": "Saving...",
    "cancel": "Cancel",
    "searchAgain": "Search another account",
    "empty": "You don't have any contacts yet.",
    "favorite": "Add to favorites",
    "unfavorite": "Remove from favorites",
    "rename": "Rename",
    "remove": "Remove",
    "removeConfirm": "Remove this contact? This does not affect transfers already made.",
    "removeConfirmButton": "Remove"
  },
```

Em `src/app/i18n.ts`, linha 18, acrescente `"contact"` ao array `ns`:

```ts
    ns: ["common", "auth", "errors", "account", "statement", "contact"],
```

- [ ] **Step 2: Escreva o teste**

Crie `src/features/contact/AddContactDialog.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import AddContactDialog from "@/features/contact/AddContactDialog";
import i18n from "@/app/i18n";

const instituicao = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  code: "001",
  name: "Banco Um",
  color_hex: "#112233",
};

const achada = {
  account_id: "cccccccc-0000-0000-0000-000000000001",
  holder_name: "M**** S****",
  type: "CHECKING",
  institution: instituicao,
};

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({
    accessToken: "tok",
    user: null,
    status: "authenticated",
    motivoEncerramento: null,
  });
  servidor.use(
    mswHttp.get(`${URL_TESTE}/institutions`, () => HttpResponse.json([instituicao])),
  );
});

async function preencherBusca() {
  const usuario = userEvent.setup();
  await screen.findByRole("option", { name: instituicao.name });
  await usuario.selectOptions(screen.getByLabelText("Instituição"), instituicao.id);
  await usuario.type(screen.getByLabelText("Agência"), "0001");
  await usuario.type(screen.getByLabelText("Número da conta"), "12345678");
  await usuario.click(screen.getByRole("button", { name: "Buscar" }));
  return usuario;
}

describe("adicionar contato", () => {
  it("mostra o titular ANTES de gravar qualquer coisa", async () => {
    // O passo de confirmacao e a unica protecao do usuario contra mandar
    // dinheiro para a conta errada. Se a gravacao acontecesse junto com a
    // busca, ele nunca veria o nome.
    let gravou = false;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/contacts/lookup`, () => HttpResponse.json(achada)),
      mswHttp.post(`${URL_TESTE}/contacts`, () => {
        gravou = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    envolverComQuery(<AddContactDialog aberto onFechar={() => {}} />);
    await preencherBusca();

    expect(await screen.findByText("M**** S****")).toBeInTheDocument();
    expect(gravou).toBe(false);
  });

  it("salva com o account_id da busca depois da confirmacao", async () => {
    let corpo: unknown = null;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/contacts/lookup`, () => HttpResponse.json(achada)),
      mswHttp.post(`${URL_TESTE}/contacts`, async ({ request }) => {
        corpo = await request.json();
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    envolverComQuery(<AddContactDialog aberto onFechar={() => {}} />);
    const usuario = await preencherBusca();

    await screen.findByText("M**** S****");
    await usuario.type(screen.getByLabelText("Apelido"), "Maria");
    await usuario.click(screen.getByRole("button", { name: "Salvar contato" }));

    await waitFor(() =>
      expect(corpo).toEqual({
        account_id: achada.account_id,
        alias: "Maria",
        is_favorite: false,
      }),
    );
  });

  it("salvar a propria conta mostra a mensagem propria, traduzida", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/contacts/lookup`, () => HttpResponse.json(achada)),
      mswHttp.post(`${URL_TESTE}/contacts`, () =>
        HttpResponse.json(
          { error: { code: "CONTACT_OWN_ACCOUNT", message: "nao use isto", details: {} } },
          { status: 422 },
        ),
      ),
    );

    envolverComQuery(<AddContactDialog aberto onFechar={() => {}} />);
    const usuario = await preencherBusca();

    await screen.findByText("M**** S****");
    await usuario.type(screen.getByLabelText("Apelido"), "Eu mesmo");
    await usuario.click(screen.getByRole("button", { name: "Salvar contato" }));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(i18n.t("CONTACT_OWN_ACCOUNT", { ns: "errors" }));
    // A mensagem do servidor nunca aparece na tela.
    expect(alerta).not.toHaveTextContent("nao use isto");
  });

  it("contato duplicado mostra mensagem DISTINTA da de conta propria", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/contacts/lookup`, () => HttpResponse.json(achada)),
      mswHttp.post(`${URL_TESTE}/contacts`, () =>
        HttpResponse.json(
          { error: { code: "CONTACT_ALREADY_EXISTS", message: "", details: {} } },
          { status: 409 },
        ),
      ),
    );

    envolverComQuery(<AddContactDialog aberto onFechar={() => {}} />);
    const usuario = await preencherBusca();

    await screen.findByText("M**** S****");
    await usuario.type(screen.getByLabelText("Apelido"), "Maria");
    await usuario.click(screen.getByRole("button", { name: "Salvar contato" }));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(i18n.t("CONTACT_ALREADY_EXISTS", { ns: "errors" }));
    expect(alerta).not.toHaveTextContent(i18n.t("CONTACT_OWN_ACCOUNT", { ns: "errors" }));
  });

  it("conta inexistente na busca mostra o erro e nao avanca para a confirmacao", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/contacts/lookup`, () =>
        HttpResponse.json(
          { error: { code: "ACCOUNT_NOT_FOUND", message: "", details: {} } },
          { status: 404 },
        ),
      ),
    );

    envolverComQuery(<AddContactDialog aberto onFechar={() => {}} />);
    await preencherBusca();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("ACCOUNT_NOT_FOUND", { ns: "errors" }),
    );
    expect(screen.queryByLabelText("Apelido")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Rode o teste e confirme que falha**

Run: `npm test -- --run src/features/contact/AddContactDialog.test.tsx`
Expected: FAIL, `Failed to resolve import "@/features/contact/AddContactDialog"`.

- [ ] **Step 4: Escreva os hooks de consulta**

Crie `src/features/contact/queries.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { buscarContaPorDados, salvarContato } from "@/features/contact/api";
import { CHAVES } from "@/features/account/queries";

export function useBuscarConta() {
  return useMutation({ mutationFn: buscarContaPorDados });
}

export function useSalvarContato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: salvarContato,
    // Sem esta linha o contato e criado no servidor e a lista na tela
    // continua a antiga — o defeito que nao quebra nada.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHAVES.contatos() });
    },
  });
}
```

- [ ] **Step 5: Escreva o formulário de busca**

Crie `src/features/contact/AccountLookup.tsx`. Ele é **reutilizado pela transferência na Task 7**, então não pode saber nada sobre contatos:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useInstituicoes } from "@/features/account/queries";
import { useBuscarConta } from "@/features/contact/queries";
import type { ResultadoBusca } from "@/features/contact/types";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";

/**
 * O primeiro passo do fluxo de dois passos, isolado de quem o usa.
 *
 * Contatos usa para adicionar; transferencia usa para mandar dinheiro sem
 * salvar. Ele nao sabe qual dos dois o chamou — so avisa quem encontrou.
 */
export default function AccountLookup({
  onEncontrada,
}: {
  onEncontrada: (achada: ResultadoBusca) => void;
}) {
  const { t } = useTranslation(["contact", "errors"]);
  const { data: instituicoes } = useInstituicoes();
  const buscar = useBuscarConta();
  const [instituicaoId, setInstituicaoId] = useState("");
  const [agencia, setAgencia] = useState("");
  const [numero, setNumero] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function aoBuscar() {
    setErro(null);
    try {
      const achada = await buscar.mutateAsync({
        institution_id: instituicaoId,
        branch: agencia.trim(),
        number: numero.trim(),
      });
      onEncontrada(achada);
    } catch (falha) {
      setErro(t(codigoTraduzivel(extrairErro(falha).code), { ns: "errors" }));
    }
  }

  const incompleto = instituicaoId === "" || agencia.trim() === "" || numero.trim() === "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="busca-instituicao">{t("contact:institution")}</Label>
        <select
          id="busca-instituicao"
          className="rounded border px-2 py-1"
          value={instituicaoId}
          onChange={(evento) => setInstituicaoId(evento.target.value)}
        >
          <option value="" />
          {(instituicoes ?? []).map((inst) => (
            <option key={inst.id} value={inst.id}>
              {inst.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="busca-agencia">{t("contact:branch")}</Label>
        <Input
          id="busca-agencia"
          value={agencia}
          onChange={(evento) => setAgencia(evento.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="busca-numero">{t("contact:number")}</Label>
        <Input
          id="busca-numero"
          value={numero}
          onChange={(evento) => setNumero(evento.target.value)}
        />
      </div>

      {erro && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <Button onClick={() => void aoBuscar()} disabled={incompleto || buscar.isPending}>
        {buscar.isPending ? t("contact:searching") : t("contact:search")}
      </Button>
    </div>
  );
}
```

- [ ] **Step 6: Escreva o diálogo**

Crie `src/features/contact/AddContactDialog.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AccountLookup from "@/features/contact/AccountLookup";
import { useSalvarContato } from "@/features/contact/queries";
import type { ResultadoBusca } from "@/features/contact/types";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";

export default function AddContactDialog({
  aberto,
  onFechar,
}: {
  aberto: boolean;
  onFechar: () => void;
}) {
  const { t } = useTranslation(["contact", "errors"]);
  const salvar = useSalvarContato();
  const [achada, setAchada] = useState<ResultadoBusca | null>(null);
  const [alias, setAlias] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  if (!aberto) return null;

  async function aoSalvar() {
    if (!achada) return;
    setErro(null);
    try {
      await salvar.mutateAsync({
        account_id: achada.account_id,
        alias: alias.trim(),
        is_favorite: false,
      });
      onFechar();
    } catch (falha) {
      setErro(t(codigoTraduzivel(extrairErro(falha).code), { ns: "errors" }));
    }
  }

  return (
    <div role="dialog" aria-label={t("contact:addTitle")} className="rounded border p-4">
      <h2 className="text-lg font-semibold">{t("contact:addTitle")}</h2>

      {achada === null ? (
        <div className="mt-4">
          <AccountLookup onEncontrada={setAchada} />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm font-medium">{t("contact:found")}</p>
          <p className="text-sm">
            {t("contact:holder")}: {achada.holder_name}
          </p>
          <p className="text-sm">{achada.institution.name}</p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contato-alias">{t("contact:alias")}</Label>
            <Input
              id="contato-alias"
              maxLength={50}
              value={alias}
              onChange={(evento) => setAlias(evento.target.value)}
            />
          </div>

          {erro && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button
              onClick={() => void aoSalvar()}
              disabled={alias.trim() === "" || salvar.isPending}
            >
              {salvar.isPending ? t("contact:saving") : t("contact:save")}
            </Button>
            <Button variant="outline" onClick={() => setAchada(null)}>
              {t("contact:searchAgain")}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4">
        <Button variant="ghost" onClick={onFechar}>
          {t("contact:cancel")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Rode os testes e confirme que passam**

Run: `npm test -- --run`
Expected: PASS, 132 testes (127 anteriores + 5 novos).

- [ ] **Step 8: Prove que o teste da confirmação discrimina**

Em `AddContactDialog.tsx`, troque temporariamente a linha do `AccountLookup` para gravar junto com a busca:

```tsx
          <AccountLookup
            onEncontrada={(a) => {
              setAchada(a);
              void salvar.mutateAsync({ account_id: a.account_id, alias: "x", is_favorite: false });
            }}
          />
```

Run: `npm test -- --run src/features/contact/AddContactDialog.test.tsx`
Expected: FAIL — `mostra o titular ANTES de gravar qualquer coisa` falha, porque `gravou` virou `true`.

**Restaure o arquivo** e rode de novo. Expected: PASS, 5 testes.

- [ ] **Step 9: Commit**

```bash
git add src/features/contact src/locales src/app/i18n.ts
git commit -m "feat: buscar uma conta e salvar como contato

O passo de confirmacao existe porque e a unica vez que o usuario ve o nome de
quem vai receber o dinheiro antes de qualquer gravacao. O teste falha se
alguem juntar a busca com a gravacao.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Contatos — a lista, favoritar, renomear e remover

**Files:**
- Create: `src/features/contact/ContactsPage.tsx`, `src/features/contact/ContactRow.tsx`
- Modify: `src/features/contact/queries.ts`
- Test: `src/features/contact/ContactsPage.test.tsx`

**Interfaces:**
- Consumes: `listarContatos`, `atualizarContato`, `removerContato` de `@/features/contact/api`; `Contato` de `@/features/contact/types`; `CHAVES` de `@/features/account/queries`.
- Produces: `useContatos()`, `useAtualizarContato()`, `useRemoverContato()`, `<ContactsPage />`, `<ContactRow contato={Contato} />`.

**A ordenação é do cliente.** `GET /contacts` não promete ordem. Favoritos primeiro, e dentro de cada grupo por apelido — feito no cliente, sobre a lista que veio. Depender de uma ordem que o servidor não garante é o defeito que só aparece quando o servidor muda.

- [ ] **Step 1: Escreva o teste**

Crie `src/features/contact/ContactsPage.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import ContactsPage from "@/features/contact/ContactsPage";
import i18n from "@/app/i18n";

const instituicao = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  code: "001",
  name: "Banco Um",
  color_hex: "#112233",
};

function contato(id: string, alias: string, favorito: boolean) {
  return {
    id,
    alias,
    is_favorite: favorito,
    target_account: {
      id: `conta-${id}`,
      branch: "0001",
      number: "12345678",
      holder_name: "M**** S****",
      type: "CHECKING",
      status: "ACTIVE",
      institution: instituicao,
    },
    created_at: "2026-03-09T14:30:00Z",
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

describe("lista de contatos", () => {
  it("mostra favoritos PRIMEIRO, mesmo quando o servidor devolve fora de ordem", async () => {
    // O gateway nao promete ordem. Este teste falha se alguem simplesmente
    // renderizar a lista na ordem em que ela chegou.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/contacts`, () =>
        HttpResponse.json([
          contato("1", "Ana", false),
          contato("2", "Bruno", true),
        ]),
      ),
    );

    envolverComQuery(<ContactsPage />);

    await screen.findByText("Bruno");
    const linhas = screen.getAllByRole("listitem");
    expect(within(linhas[0]).getByText("Bruno")).toBeInTheDocument();
    expect(within(linhas[1]).getByText("Ana")).toBeInTheDocument();
  });

  it("mostra o estado vazio proprio", async () => {
    servidor.use(mswHttp.get(`${URL_TESTE}/contacts`, () => HttpResponse.json([])));

    envolverComQuery(<ContactsPage />);

    expect(await screen.findByText("Você ainda não tem contatos.")).toBeInTheDocument();
  });

  it("favoritar REFAZ a lista", async () => {
    // Sem a invalidacao o PATCH acontece no servidor e a tela continua
    // mostrando o estado anterior.
    let favorito = false;
    let listagens = 0;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/contacts`, () => {
        listagens += 1;
        return HttpResponse.json([contato("1", "Ana", favorito)]);
      }),
      mswHttp.patch(`${URL_TESTE}/contacts/1`, async ({ request }) => {
        const corpo = (await request.json()) as { is_favorite?: boolean };
        favorito = corpo.is_favorite ?? false;
        return HttpResponse.json(contato("1", "Ana", favorito));
      }),
    );

    envolverComQuery(<ContactsPage />);
    await screen.findByText("Ana");
    const antes = listagens;

    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Favoritar" }));

    await waitFor(() => expect(listagens).toBeGreaterThan(antes));
    expect(await screen.findByRole("button", { name: "Desfavoritar" })).toBeInTheDocument();
  });

  it("remover pede confirmacao antes de chamar o servidor", async () => {
    let removeu = false;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/contacts`, () =>
        HttpResponse.json(removeu ? [] : [contato("1", "Ana", false)]),
      ),
      mswHttp.delete(`${URL_TESTE}/contacts/1`, () => {
        removeu = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    envolverComQuery(<ContactsPage />);
    await screen.findByText("Ana");

    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Remover" }));
    expect(removeu).toBe(false);

    await usuario.click(await screen.findByRole("button", { name: "Remover", exact: true }));
    await waitFor(() => expect(removeu).toBe(true));
  });

  it("renomear REFAZ a lista com o apelido novo", async () => {
    let alias = "Ana";
    servidor.use(
      mswHttp.get(`${URL_TESTE}/contacts`, () =>
        HttpResponse.json([contato("1", alias, false)]),
      ),
      mswHttp.patch(`${URL_TESTE}/contacts/1`, async ({ request }) => {
        const corpo = (await request.json()) as { alias?: string };
        alias = corpo.alias ?? alias;
        return HttpResponse.json(contato("1", alias, false));
      }),
    );

    envolverComQuery(<ContactsPage />);
    await screen.findByText("Ana");

    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Renomear" }));
    const campo = await screen.findByLabelText("Apelido");
    await usuario.clear(campo);
    await usuario.type(campo, "Ana Maria");
    await usuario.click(screen.getByRole("button", { name: "Salvar contato" }));

    expect(await screen.findByText("Ana Maria")).toBeInTheDocument();
  });

  it("o titular mascarado aparece como veio, sem remascarar", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/contacts`, () =>
        HttpResponse.json([contato("1", "Ana", false)]),
      ),
    );

    envolverComQuery(<ContactsPage />);

    expect(await screen.findByText("M**** S****")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rode o teste e confirme que falha**

Run: `npm test -- --run src/features/contact/ContactsPage.test.tsx`
Expected: FAIL, `Failed to resolve import "@/features/contact/ContactsPage"`.

- [ ] **Step 3: Acrescente os hooks**

Em `src/features/contact/queries.ts`, acrescente ao final:

```ts
import { useQuery } from "@tanstack/react-query";
import { atualizarContato, listarContatos, removerContato } from "@/features/contact/api";

export function useContatos() {
  return useQuery({ queryKey: CHAVES.contatos(), queryFn: listarContatos });
}

function invalidarContatos(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: CHAVES.contatos() });
}

export function useAtualizarContato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mudanca }: { id: string; mudanca: { alias?: string; is_favorite?: boolean } }) =>
      atualizarContato(id, mudanca),
    onSuccess: () => invalidarContatos(qc),
  });
}

export function useRemoverContato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: removerContato,
    onSuccess: () => invalidarContatos(qc),
  });
}
```

Ajuste a linha de import do topo do arquivo para incluir `useQuery`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
```

- [ ] **Step 4: Escreva a linha de contato**

Crie `src/features/contact/ContactRow.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAtualizarContato, useRemoverContato } from "@/features/contact/queries";
import type { Contato } from "@/features/contact/types";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";

export default function ContactRow({ contato }: { contato: Contato }) {
  const { t } = useTranslation(["contact", "errors"]);
  const atualizar = useAtualizarContato();
  const remover = useRemoverContato();
  const [renomeando, setRenomeando] = useState(false);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  const [alias, setAlias] = useState(contato.alias);
  const [erro, setErro] = useState<string | null>(null);

  async function executar(acao: () => Promise<unknown>) {
    setErro(null);
    try {
      await acao();
      setRenomeando(false);
      setConfirmandoRemocao(false);
    } catch (falha) {
      setErro(t(codigoTraduzivel(extrairErro(falha).code), { ns: "errors" }));
    }
  }

  const conta = contato.target_account;

  return (
    <li className="flex flex-col gap-2 rounded border p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{contato.alias}</p>
          <p className="text-sm text-muted-foreground">{conta.holder_name}</p>
          <p className="text-sm text-muted-foreground">
            {conta.institution.name} · {conta.branch} · {conta.number}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() =>
              void executar(() =>
                atualizar.mutateAsync({
                  id: contato.id,
                  mudanca: { is_favorite: !contato.is_favorite },
                }),
              )
            }
          >
            {contato.is_favorite ? t("contact:unfavorite") : t("contact:favorite")}
          </Button>
          <Button variant="outline" onClick={() => setRenomeando(true)}>
            {t("contact:rename")}
          </Button>
          <Button variant="outline" onClick={() => setConfirmandoRemocao(true)}>
            {t("contact:remove")}
          </Button>
        </div>
      </div>

      {renomeando && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`alias-${contato.id}`}>{t("contact:alias")}</Label>
          <Input
            id={`alias-${contato.id}`}
            maxLength={50}
            value={alias}
            onChange={(evento) => setAlias(evento.target.value)}
          />
          <div className="flex gap-2">
            <Button
              onClick={() =>
                void executar(() =>
                  atualizar.mutateAsync({ id: contato.id, mudanca: { alias: alias.trim() } }),
                )
              }
              disabled={alias.trim() === ""}
            >
              {t("contact:save")}
            </Button>
            <Button variant="ghost" onClick={() => setRenomeando(false)}>
              {t("contact:cancel")}
            </Button>
          </div>
        </div>
      )}

      {confirmandoRemocao && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">{t("contact:removeConfirm")}</p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              onClick={() => void executar(() => remover.mutateAsync(contato.id))}
            >
              {t("contact:removeConfirmButton")}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmandoRemocao(false)}>
              {t("contact:cancel")}
            </Button>
          </div>
        </div>
      )}

      {erro && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
    </li>
  );
}
```

- [ ] **Step 5: Escreva a página**

Crie `src/features/contact/ContactsPage.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AddContactDialog from "@/features/contact/AddContactDialog";
import ContactRow from "@/features/contact/ContactRow";
import { useContatos } from "@/features/contact/queries";
import type { Contato } from "@/features/contact/types";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";

/**
 * Favoritos primeiro, depois por apelido. A ordenacao e do CLIENTE: o
 * gateway nao promete ordem nenhuma em GET /contacts, e depender de uma que
 * ele nao garante e o defeito que so aparece quando o servidor muda.
 */
function ordenar(contatos: Contato[]): Contato[] {
  return [...contatos].sort((a, b) => {
    if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
    return a.alias.localeCompare(b.alias);
  });
}

export default function ContactsPage() {
  const { t } = useTranslation(["contact", "errors"]);
  const { data: contatos, isPending, isError, error } = useContatos();
  const [adicionando, setAdicionando] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("contact:title")}</h1>
        <Button onClick={() => setAdicionando(true)}>{t("contact:add")}</Button>
      </div>

      {adicionando && (
        <AddContactDialog aberto onFechar={() => setAdicionando(false)} />
      )}

      {isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {t(codigoTraduzivel(extrairErro(error).code), { ns: "errors" })}
          </AlertDescription>
        </Alert>
      )}

      {!isPending && !isError && contatos.length === 0 && <p>{t("contact:empty")}</p>}

      {!isPending && !isError && contatos.length > 0 && (
        <ul className="flex flex-col gap-2">
          {ordenar(contatos).map((contato) => (
            <ContactRow key={contato.id} contato={contato} />
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Rode os testes e confirme que passam**

Run: `npm test -- --run`
Expected: PASS, 138 testes (132 anteriores + 6 novos).

- [ ] **Step 7: Prove que o teste da ordenação discrimina**

Em `ContactsPage.tsx`, troque `ordenar(contatos)` por `contatos` na linha do `.map`.

Run: `npm test -- --run src/features/contact/ContactsPage.test.tsx`
Expected: FAIL — `mostra favoritos PRIMEIRO, mesmo quando o servidor devolve fora de ordem` falha.

**Restaure o arquivo** e rode de novo. Expected: PASS, 6 testes.

- [ ] **Step 8: Commit**

```bash
git add src/features/contact
git commit -m "feat: lista de contatos com favoritos, renomear e remover

A ordenacao e do cliente porque GET /contacts nao promete ordem. O teste
manda o servidor devolver fora de ordem de proposito.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: O recibo

**Files:**
- Create: `src/features/transaction/queries.ts`, `src/features/transaction/TransactionReceiptPage.tsx`
- Modify: `src/lib/errors.ts`, `src/locales/pt-BR.json`, `src/locales/en.json`, `src/app/i18n.ts`
- Test: `src/features/transaction/TransactionReceiptPage.test.tsx`

**Interfaces:**
- Consumes: `buscarTransacao` de `@/features/transaction/api`; `Transacao`, `MOTIVOS_DE_FALHA` de `@/features/transaction/types`; `CHAVES` de `@/features/account/queries`; `formatarDinheiro`, `paraCentavos` de `@/lib/money`; `formatarDataHora` de `@/lib/datetime`.
- Produces: `useTransacao(id: string)`, `motivoTraduzivel(motivo: string | null): string`, `<TransactionReceiptPage />`.

**Como o recibo sabe se a transação é nova.** O `202` contra `200` chega ao recibo pelo estado de navegação (`navigate(rota, { state: { criadaAgora } })`), porque a rota sozinha só carrega o `id`. Depois de um recarregamento esse estado se perde, e aí o recibo **não afirma nada** sobre novidade — mostra só o estado atual da transação. Isso é correto: dizer "enviada agora" depois de um recarregamento seria mentira.

**Motivo de falha traduzido por código.** `failure_reason` é um conjunto fechado de três valores definido no enum `FailureReason` do worker. `INSUFFICIENT_FUNDS` já está no catálogo; os outros dois entram aqui.

- [ ] **Step 1: Acrescente os dois códigos ao catálogo de erros**

Em `src/lib/errors.ts`, dentro do array `CODIGOS_DE_ERRO`, acrescente as duas entradas depois de `"INSUFFICIENT_FUNDS"`:

```ts
  "INSUFFICIENT_FUNDS",
  "SOURCE_ACCOUNT_UNAVAILABLE",
  "DESTINATION_ACCOUNT_UNAVAILABLE",
```

- [ ] **Step 2: Acrescente as traduções**

Em `src/locales/pt-BR.json`, dentro do bloco `errors`, acrescente:

```json
    "SOURCE_ACCOUNT_UNAVAILABLE": "A conta de origem não estava disponível quando a transação foi processada.",
    "DESTINATION_ACCOUNT_UNAVAILABLE": "A conta de destino não estava disponível quando a transação foi processada.",
```

Em `src/locales/en.json`, dentro do bloco `errors`:

```json
    "SOURCE_ACCOUNT_UNAVAILABLE": "The source account was unavailable when the transaction was processed.",
    "DESTINATION_ACCOUNT_UNAVAILABLE": "The destination account was unavailable when the transaction was processed.",
```

E acrescente um bloco `transaction` no nível raiz de `src/locales/pt-BR.json`:

```json
  "transaction": {
    "receiptTitle": "Comprovante",
    "amount": "Valor",
    "type": "Tipo",
    "DEPOSIT": "Depósito",
    "TRANSFER": "Transferência",
    "when": "Quando",
    "statusLabel": "Situação",
    "PENDING": "Aceita, ainda não concluída",
    "COMPLETED": "Concluída",
    "FAILED": "Não concluída",
    "pendingExplained": "O pedido foi aceito e está sendo processado. O dinheiro ainda não saiu.",
    "createdNow": "Pedido enviado agora.",
    "replayed": "Este pedido já tinha sido enviado. Você está vendo a mesma transação, não uma nova.",
    "refresh": "Atualizar situação",
    "refreshing": "Atualizando...",
    "backToStatement": "Ver o extrato",
    "saveContact": "Salvar destino como contato",
    "transferTitle": "Transferir",
    "depositTitle": "Depositar",
    "source": "Conta de origem",
    "account": "Conta",
    "destination": "Destino",
    "savedContact": "Contato salvo",
    "newAccount": "Buscar outra conta",
    "value": "Valor",
    "send": "Enviar",
    "sending": "Enviando...",
    "available": "Disponível",
    "overAvailable": "O valor é maior que o disponível calculado. Você pode enviar mesmo assim — quem decide é o servidor."
  },
```

Em `src/locales/en.json`, o mesmo bloco:

```json
  "transaction": {
    "receiptTitle": "Receipt",
    "amount": "Amount",
    "type": "Type",
    "DEPOSIT": "Deposit",
    "TRANSFER": "Transfer",
    "when": "When",
    "statusLabel": "Status",
    "PENDING": "Accepted, not completed yet",
    "COMPLETED": "Completed",
    "FAILED": "Not completed",
    "pendingExplained": "The request was accepted and is being processed. The money has not moved yet.",
    "createdNow": "Request sent just now.",
    "replayed": "This request had already been sent. You are seeing the same transaction, not a new one.",
    "refresh": "Refresh status",
    "refreshing": "Refreshing...",
    "backToStatement": "View statement",
    "saveContact": "Save destination as contact",
    "transferTitle": "Transfer",
    "depositTitle": "Deposit",
    "source": "Source account",
    "account": "Account",
    "destination": "Destination",
    "savedContact": "Saved contact",
    "newAccount": "Search another account",
    "value": "Amount",
    "send": "Send",
    "sending": "Sending...",
    "available": "Available",
    "overAvailable": "The amount is higher than the calculated available balance. You can send anyway — the server decides."
  },
```

Em `src/app/i18n.ts`, acrescente `"transaction"` ao array `ns`:

```ts
    ns: ["common", "auth", "errors", "account", "statement", "contact", "transaction"],
```

- [ ] **Step 3: Escreva o teste**

Crie `src/features/transaction/TransactionReceiptPage.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import TransactionReceiptPage from "@/features/transaction/TransactionReceiptPage";
import i18n from "@/app/i18n";

function transacao(extras: Record<string, unknown> = {}) {
  return {
    id: "tx-1",
    type: "TRANSFER",
    status: "PENDING",
    amount: "150.00",
    source_account_id: "conta-origem",
    destination_account_id: "conta-destino",
    failure_reason: null,
    created_at: "2026-03-09T14:30:00Z",
    ...extras,
  };
}

function montar(estado: { criadaAgora?: boolean } | null = null) {
  return envolverComQuery(
    <MemoryRouter initialEntries={[{ pathname: "/transacoes/tx-1", state: estado }]}>
      <Routes>
        <Route path="/transacoes/:id" element={<TransactionReceiptPage />} />
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
});

describe("recibo", () => {
  it("diz que PENDING ainda nao concluiu, com todas as letras", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () => HttpResponse.json(transacao())),
    );

    montar();

    expect(await screen.findByText("Aceita, ainda não concluída")).toBeInTheDocument();
    expect(
      screen.getByText("O pedido foi aceito e está sendo processado. O dinheiro ainda não saiu."),
    ).toBeInTheDocument();
  });

  it("distingue a criada agora (202) da reapresentada (200)", async () => {
    // Esta e a razao do RespostaTransacao carregar o status: sem isso, um
    // reenvio diria "enviado agora" sem ter enviado nada.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () => HttpResponse.json(transacao())),
    );

    const { unmount } = montar({ criadaAgora: true });
    expect(await screen.findByText("Pedido enviado agora.")).toBeInTheDocument();
    unmount();

    montar({ criadaAgora: false });
    expect(
      await screen.findByText(
        "Este pedido já tinha sido enviado. Você está vendo a mesma transação, não uma nova.",
      ),
    ).toBeInTheDocument();
  });

  it("sem estado de navegacao NAO afirma nada sobre novidade", async () => {
    // E o caso do recarregamento: a chave de idempotencia morreu, o estado
    // da navegacao tambem. Dizer "enviada agora" aqui seria mentira.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () => HttpResponse.json(transacao())),
    );

    montar(null);

    await screen.findByText("Aceita, ainda não concluída");
    expect(screen.queryByText("Pedido enviado agora.")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Este pedido já tinha sido enviado. Você está vendo a mesma transação, não uma nova.",
      ),
    ).not.toBeInTheDocument();
  });

  it("o botao de atualizar busca o estado atual, sem timer", async () => {
    let status = "PENDING";
    let buscas = 0;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () => {
        buscas += 1;
        return HttpResponse.json(transacao({ status }));
      }),
    );

    montar();
    await screen.findByText("Aceita, ainda não concluída");
    const antes = buscas;

    status = "COMPLETED";
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Atualizar situação" }));

    expect(await screen.findByText("Concluída")).toBeInTheDocument();
    expect(buscas).toBeGreaterThan(antes);
  });

  it("traduz o motivo da falha POR CODIGO", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () =>
        HttpResponse.json(
          transacao({ status: "FAILED", failure_reason: "DESTINATION_ACCOUNT_UNAVAILABLE" }),
        ),
      ),
    );

    montar();

    expect(
      await screen.findByText(
        i18n.t("DESTINATION_ACCOUNT_UNAVAILABLE", { ns: "errors" }),
      ),
    ).toBeInTheDocument();
  });

  it("motivo desconhecido NAO vaza para a tela", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () =>
        HttpResponse.json(
          transacao({ status: "FAILED", failure_reason: "ALGO_QUE_O_WORKER_INVENTOU" }),
        ),
      ),
    );

    montar();

    await screen.findByText("Não concluída");
    expect(screen.queryByText(/ALGO_QUE_O_WORKER_INVENTOU/)).not.toBeInTheDocument();
    expect(screen.getByText(i18n.t("UNKNOWN", { ns: "errors" }))).toBeInTheDocument();
  });

  it("formata o valor em BRL mesmo em ingles", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () => HttpResponse.json(transacao())),
    );

    await i18n.changeLanguage("en");
    montar();

    const valor = await screen.findByText(/150/);
    expect(valor).toHaveTextContent("R$");
    expect(valor.textContent).not.toMatch(/(?<!R)\$/);
  });
});
```

- [ ] **Step 4: Rode o teste e confirme que falha**

Run: `npm test -- --run src/features/transaction/TransactionReceiptPage.test.tsx`
Expected: FAIL, `Failed to resolve import "@/features/transaction/TransactionReceiptPage"`.

- [ ] **Step 5: Escreva o hook de consulta**

Crie `src/features/transaction/queries.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { buscarTransacao } from "@/features/transaction/api";
import { CHAVES } from "@/features/account/queries";
import { MOTIVOS_DE_FALHA } from "@/features/transaction/types";

export function useTransacao(id: string) {
  return useQuery({
    queryKey: CHAVES.transacao(id),
    queryFn: () => buscarTransacao(id),
  });
}

const motivosConhecidos = new Set<string>(MOTIVOS_DE_FALHA);

/**
 * O codigo pronto para o t(..., { ns: "errors" }).
 *
 * failure_reason e um conjunto FECHADO de tres valores no enum do worker,
 * mas nada impede o worker de ganhar um quarto antes do frontend. Um valor
 * fora da lista cai em UNKNOWN em vez de virar chave crua na tela.
 */
export function motivoTraduzivel(motivo: string | null): string {
  if (motivo !== null && motivosConhecidos.has(motivo)) return motivo;
  if (motivo !== null) {
    console.warn(
      `[nexuspay] failure_reason desconhecido vindo do worker: ${motivo}. ` +
        `Acrescente-o a MOTIVOS_DE_FALHA, a CODIGOS_DE_ERRO e aos dois dicionarios.`,
    );
  }
  return "UNKNOWN";
}
```

- [ ] **Step 6: Escreva o recibo**

Crie `src/features/transaction/TransactionReceiptPage.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Link, useLocation, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { motivoTraduzivel, useTransacao } from "@/features/transaction/queries";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";
import { formatarDataHora } from "@/lib/datetime";
import { formatarDinheiro, paraCentavos } from "@/lib/money";

export default function TransactionReceiptPage() {
  const { t, i18n } = useTranslation(["transaction", "errors"]);
  const { id = "" } = useParams<{ id: string }>();
  const local = useLocation();
  const { data: transacao, isPending, isError, error, refetch, isFetching } = useTransacao(id);

  // So existe quando o recibo foi alcancado logo depois do envio. Depois de
  // um recarregamento e undefined, e ai o recibo nao afirma nada sobre
  // novidade — dizer "enviada agora" seria mentira.
  const criadaAgora = (local.state as { criadaAgora?: boolean } | null)?.criadaAgora;

  if (isError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>
          {t(codigoTraduzivel(extrairErro(error).code), { ns: "errors" })}
        </AlertDescription>
      </Alert>
    );
  }

  if (isPending) return null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("transaction:receiptTitle")}</h1>

      {criadaAgora === true && <p>{t("transaction:createdNow")}</p>}
      {criadaAgora === false && (
        <Alert role="status">
          <AlertDescription>{t("transaction:replayed")}</AlertDescription>
        </Alert>
      )}

      <p>
        {t("transaction:amount")}:{" "}
        {formatarDinheiro(paraCentavos(transacao.amount), i18n.language)}
      </p>
      <p>
        {t("transaction:type")}: {t(`transaction:${transacao.type}`)}
      </p>
      <p>
        {t("transaction:when")}: {formatarDataHora(transacao.created_at, i18n.language)}
      </p>
      <p>
        {t("transaction:statusLabel")}: {t(`transaction:${transacao.status}`)}
      </p>

      {transacao.status === "PENDING" && <p>{t("transaction:pendingExplained")}</p>}

      {transacao.status === "FAILED" && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {t(motivoTraduzivel(transacao.failure_reason), { ns: "errors" })}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? t("transaction:refreshing") : t("transaction:refresh")}
        </Button>
        {transacao.source_account_id && (
          <Button variant="outline" asChild>
            <Link to={`/contas/${transacao.source_account_id}`}>
              {t("transaction:backToStatement")}
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Rode os testes e confirme que passam**

Run: `npm test -- --run`
Expected: PASS, 145 testes (138 anteriores + 7 novos).

- [ ] **Step 8: Prove que dois testes discriminam**

Primeiro, em `TransactionReceiptPage.tsx`, troque `motivoTraduzivel(transacao.failure_reason)` por `transacao.failure_reason ?? "UNKNOWN"`.

Run: `npm test -- --run src/features/transaction/TransactionReceiptPage.test.tsx`
Expected: FAIL — `motivo desconhecido NAO vaza para a tela` falha.

**Restaure.** Depois troque `criadaAgora === true && ...` por `criadaAgora !== false && ...`.

Run: `npm test -- --run src/features/transaction/TransactionReceiptPage.test.tsx`
Expected: FAIL — `sem estado de navegacao NAO afirma nada sobre novidade` falha.

**Restaure o arquivo** e rode de novo. Expected: PASS, 7 testes.

- [ ] **Step 9: Commit**

```bash
git add src/features/transaction src/lib/errors.ts src/locales src/app/i18n.ts
git commit -m "feat: recibo com o estado da transacao e o motivo da falha traduzido

O 202 e o 200 chegam pelo estado da navegacao e nao pela rota, entao depois
de um recarregamento o recibo nao afirma nada sobre novidade — so mostra o
estado atual. Dizer "enviada agora" ali seria mentira.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Depósito

**Files:**
- Create: `src/features/transaction/DepositPage.tsx`
- Modify: `src/features/transaction/queries.ts`
- Test: `src/features/transaction/DepositPage.test.tsx`

**Interfaces:**
- Consumes: `depositar` de `@/features/transaction/api`; `useChaveDeIntencao` de `@/features/transaction/idempotency`; `useContas` e `CHAVES` de `@/features/account/queries`.
- Produces: `useDepositar()`, `<DepositPage />`.

Depósito é o formulário mais simples — conta e valor — e é ele que estabelece o padrão que a transferência vai seguir na Task 7. É também a única forma de pôr dinheiro numa conta, e por isso o que destrava o teste ponta a ponta com saldo real.

- [ ] **Step 1: Escreva o teste**

Crie `src/features/transaction/DepositPage.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import DepositPage from "@/features/transaction/DepositPage";
import i18n from "@/app/i18n";

const conta = {
  id: "conta-1",
  branch: "0001",
  number: "12345678",
  alias: "Principal",
  type: "CHECKING",
  balance: "500.00",
  status: "ACTIVE",
  institution: {
    id: "inst-1",
    code: "001",
    name: "Banco Um",
    color_hex: "#112233",
  },
  created_at: "2026-03-01T10:00:00Z",
};

/** Expoe a rota e o estado da navegacao para o teste conferir. */
function Espiao() {
  const local = useLocation();
  return (
    <div>
      <span data-testid="rota">{local.pathname}</span>
      <span data-testid="criada">{String((local.state as { criadaAgora?: boolean } | null)?.criadaAgora)}</span>
    </div>
  );
}

function montar() {
  return envolverComQuery(
    <MemoryRouter initialEntries={["/depositar"]}>
      <Routes>
        <Route path="/depositar" element={<DepositPage />} />
        <Route path="/transacoes/:id" element={<Espiao />} />
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
  servidor.use(mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([conta])));
});

describe("deposito", () => {
  it("manda o cabecalho Idempotency-Key e leva ao recibo", async () => {
    let chave: string | null = null;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/deposit`, ({ request }) => {
        chave = request.headers.get("Idempotency-Key");
        return HttpResponse.json(
          {
            id: "tx-1",
            type: "DEPOSIT",
            status: "PENDING",
            amount: "100.00",
            source_account_id: null,
            destination_account_id: conta.id,
            failure_reason: null,
            created_at: "2026-03-09T14:30:00Z",
          },
          { status: 202 },
        );
      }),
    );

    montar();
    const usuario = userEvent.setup();
    await screen.findByRole("option", { name: /Principal/ });
    await usuario.selectOptions(screen.getByLabelText("Conta"), conta.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByTestId("rota")).toHaveTextContent("/transacoes/tx-1");
    expect(chave).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("o 202 chega ao recibo como criadaAgora true", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/deposit`, () =>
        HttpResponse.json(
          {
            id: "tx-1",
            type: "DEPOSIT",
            status: "PENDING",
            amount: "100.00",
            source_account_id: null,
            destination_account_id: conta.id,
            failure_reason: null,
            created_at: "2026-03-09T14:30:00Z",
          },
          { status: 202 },
        ),
      ),
    );

    montar();
    const usuario = userEvent.setup();
    await screen.findByRole("option", { name: /Principal/ });
    await usuario.selectOptions(screen.getByLabelText("Conta"), conta.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByTestId("criada")).toHaveTextContent("true");
  });

  it("o 200 chega ao recibo como criadaAgora false", async () => {
    // O gateway responde 200 quando a chave ja tinha sido usada. A tela
    // precisa saber, senao diz que enviou algo que nao enviou.
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/deposit`, () =>
        HttpResponse.json(
          {
            id: "tx-1",
            type: "DEPOSIT",
            status: "PENDING",
            amount: "100.00",
            source_account_id: null,
            destination_account_id: conta.id,
            failure_reason: null,
            created_at: "2026-03-09T14:30:00Z",
          },
          { status: 200 },
        ),
      ),
    );

    montar();
    const usuario = userEvent.setup();
    await screen.findByRole("option", { name: /Principal/ });
    await usuario.selectOptions(screen.getByLabelText("Conta"), conta.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByTestId("criada")).toHaveTextContent("false");
  });

  it("erro do servidor aparece traduzido por codigo, nunca a mensagem", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/deposit`, () =>
        HttpResponse.json(
          { error: { code: "ACCOUNT_NOT_FOUND", message: "nao mostre isto", details: {} } },
          { status: 404 },
        ),
      ),
    );

    montar();
    const usuario = userEvent.setup();
    await screen.findByRole("option", { name: /Principal/ });
    await usuario.selectOptions(screen.getByLabelText("Conta"), conta.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(i18n.t("ACCOUNT_NOT_FOUND", { ns: "errors" }));
    expect(alerta).not.toHaveTextContent("nao mostre isto");
  });
});
```

- [ ] **Step 2: Rode o teste e confirme que falha**

Run: `npm test -- --run src/features/transaction/DepositPage.test.tsx`
Expected: FAIL, `Failed to resolve import "@/features/transaction/DepositPage"`.

- [ ] **Step 3: Acrescente o hook de depósito**

Em `src/features/transaction/queries.ts`, acrescente ao final:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { depositar } from "@/features/transaction/api";

/**
 * Depois de mover dinheiro, tudo que depende de conta esta velho: a lista,
 * o saldo do detalhe, o extrato e a soma de pendentes. Invalidar so a lista
 * deixaria o extrato mostrando o estado anterior.
 */
function invalidarTudoDeConta(qc: ReturnType<typeof useQueryClient>, contaId: string) {
  void qc.invalidateQueries({ queryKey: CHAVES.contas() });
  void qc.invalidateQueries({ queryKey: CHAVES.conta(contaId) });
  void qc.invalidateQueries({ queryKey: CHAVES.extrato(contaId) });
  void qc.invalidateQueries({ queryKey: CHAVES.extratoPendentes(contaId) });
}

export function useDepositar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      entrada,
      chave,
    }: {
      entrada: { account_id: string; amount: string };
      chave: string;
    }) => depositar(entrada, chave),
    onSuccess: (_resposta, variaveis) => {
      invalidarTudoDeConta(qc, variaveis.entrada.account_id);
    },
  });
}
```

Ajuste o import do topo do arquivo:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buscarTransacao, depositar } from "@/features/transaction/api";
```

- [ ] **Step 4: Escreva a página**

Crie `src/features/transaction/DepositPage.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useContas } from "@/features/account/queries";
import { useChaveDeIntencao } from "@/features/transaction/idempotency";
import { useDepositar } from "@/features/transaction/queries";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";

export default function DepositPage() {
  const { t } = useTranslation(["transaction", "errors"]);
  const navegar = useNavigate();
  const { data: contas } = useContas();
  const depositar = useDepositar();
  const [contaId, setContaId] = useState("");
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  // A chave morre e renasce junto com a intencao: mudar a conta ou o valor
  // torna isto outro pedido, e o gateway precisa saber disso.
  const { chave, limparChave } = useChaveDeIntencao({ account_id: contaId, amount: valor });

  async function aoEnviar() {
    setErro(null);
    try {
      const { transacao, criadaAgora } = await depositar.mutateAsync({
        entrada: { account_id: contaId, amount: valor.trim() },
        chave,
      });
      limparChave();
      navegar(`/transacoes/${transacao.id}`, { state: { criadaAgora } });
    } catch (falha) {
      setErro(t(codigoTraduzivel(extrairErro(falha).code), { ns: "errors" }));
    }
  }

  const incompleto = contaId === "" || valor.trim() === "";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("transaction:depositTitle")}</h1>

      <div className="flex flex-col gap-2">
        <Label htmlFor="deposito-conta">{t("transaction:account")}</Label>
        <select
          id="deposito-conta"
          className="rounded border px-2 py-1"
          value={contaId}
          onChange={(evento) => setContaId(evento.target.value)}
        >
          <option value="" />
          {(contas ?? []).map((conta) => (
            <option key={conta.id} value={conta.id}>
              {conta.alias ?? conta.number} · {conta.institution.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="deposito-valor">{t("transaction:value")}</Label>
        <Input
          id="deposito-valor"
          inputMode="decimal"
          value={valor}
          onChange={(evento) => setValor(evento.target.value)}
        />
      </div>

      {erro && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <Button onClick={() => void aoEnviar()} disabled={incompleto || depositar.isPending}>
        {depositar.isPending ? t("transaction:sending") : t("transaction:send")}
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Rode os testes e confirme que passam**

Run: `npm test -- --run`
Expected: PASS, 149 testes (145 anteriores + 4 novos).

- [ ] **Step 6: Prove que o teste do 200 discrimina**

Em `src/features/transaction/api.ts`, troque `criadaAgora: status === 202` por `criadaAgora: true`.

Run: `npm test -- --run src/features/transaction/DepositPage.test.tsx`
Expected: FAIL — `o 200 chega ao recibo como criadaAgora false` falha.

**Restaure o arquivo** e rode de novo. Expected: PASS, 4 testes.

- [ ] **Step 7: Commit**

```bash
git add src/features/transaction
git commit -m "feat: deposito com chave de idempotencia e recibo

A invalidacao cobre lista, conta, extrato e pendentes: depois de mover
dinheiro, invalidar so a lista deixaria o extrato mostrando o estado anterior.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Transferência

**Files:**
- Create: `src/features/transaction/TransferPage.tsx`
- Modify: `src/features/transaction/queries.ts`
- Test: `src/features/transaction/TransferPage.test.tsx`

**Interfaces:**
- Consumes: `transferir` de `@/features/transaction/api`; `AccountLookup` de `@/features/contact/AccountLookup`; `useContatos` de `@/features/contact/queries`; `usePendentesDeSaida` de `@/features/statement/queries`; `useChaveDeIntencao`; `useContas`.
- Produces: `useTransferir()`, `<TransferPage />`.

**As duas entradas de destino.** Contato salvo ou busca na hora. As duas terminam num `account_id`, que é o que o gateway pede. A busca reusa o `AccountLookup` da Task 3 sem modificação — se ele precisar mudar para servir aqui, o acoplamento está errado.

**O disponível avisa, não bloqueia.** O botão continua ativo mesmo quando o valor passa do disponível calculado. Duas razões: o disponível derivado pode estar **maior** que o real (furo declarado na §6 do spec da 3b), e uma segunda autoridade sobre dinheiro no cliente é o que cria divergência entre o que a tela promete e o que o servidor faz.

- [ ] **Step 1: Escreva o teste**

Crie `src/features/transaction/TransferPage.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import TransferPage from "@/features/transaction/TransferPage";
import i18n from "@/app/i18n";

const instituicao = { id: "inst-1", code: "001", name: "Banco Um", color_hex: "#112233" };

const conta = {
  id: "conta-1",
  branch: "0001",
  number: "12345678",
  alias: "Principal",
  type: "CHECKING",
  balance: "500.00",
  status: "ACTIVE",
  institution: instituicao,
  created_at: "2026-03-01T10:00:00Z",
};

const contato = {
  id: "contato-1",
  alias: "Maria",
  is_favorite: false,
  target_account: {
    id: "conta-maria",
    branch: "0002",
    number: "87654321",
    holder_name: "M**** S****",
    type: "CHECKING",
    status: "ACTIVE",
    institution: instituicao,
  },
  created_at: "2026-03-01T10:00:00Z",
};

function Espiao() {
  const local = useLocation();
  return <span data-testid="rota">{local.pathname}</span>;
}

function montar() {
  return envolverComQuery(
    <MemoryRouter initialEntries={["/transferir"]}>
      <Routes>
        <Route path="/transferir" element={<TransferPage />} />
        <Route path="/transacoes/:id" element={<Espiao />} />
      </Routes>
    </MemoryRouter>,
  );
}

function respostaTransacao(status: number) {
  return HttpResponse.json(
    {
      id: "tx-1",
      type: "TRANSFER",
      status: "PENDING",
      amount: "100.00",
      source_account_id: conta.id,
      destination_account_id: "conta-maria",
      failure_reason: null,
      created_at: "2026-03-09T14:30:00Z",
    },
    { status },
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
    mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([conta])),
    mswHttp.get(`${URL_TESTE}/contacts`, () => HttpResponse.json([contato])),
    mswHttp.get(`${URL_TESTE}/institutions`, () => HttpResponse.json([instituicao])),
    mswHttp.get(`${URL_TESTE}/accounts/${conta.id}/statement`, () =>
      HttpResponse.json({ items: [], next_cursor: null }),
    ),
  );
});

async function escolherOrigem(usuario: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("option", { name: /Principal/ });
  await usuario.selectOptions(screen.getByLabelText("Conta de origem"), conta.id);
}

describe("transferencia", () => {
  it("transfere para um contato salvo", async () => {
    let corpo: unknown = null;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, async ({ request }) => {
        corpo = await request.json();
        return respostaTransacao(202);
      }),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await screen.findByRole("option", { name: /Maria/ });
    await usuario.selectOptions(screen.getByLabelText("Destino"), contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() =>
      expect(corpo).toEqual({
        source_account_id: conta.id,
        destination_account_id: "conta-maria",
        amount: "100.00",
      }),
    );
    expect(await screen.findByTestId("rota")).toHaveTextContent("/transacoes/tx-1");
  });

  it("transfere para uma conta buscada na hora, sem salvar contato", async () => {
    let salvouContato = false;
    let corpo: unknown = null;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/contacts`, () => {
        salvouContato = true;
        return HttpResponse.json({}, { status: 201 });
      }),
      mswHttp.post(`${URL_TESTE}/contacts/lookup`, () =>
        HttpResponse.json({
          account_id: "conta-nova",
          holder_name: "J**** P****",
          type: "CHECKING",
          institution: instituicao,
        }),
      ),
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, async ({ request }) => {
        corpo = await request.json();
        return respostaTransacao(202);
      }),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await usuario.click(screen.getByRole("button", { name: "Buscar outra conta" }));

    await screen.findByRole("option", { name: instituicao.name });
    await usuario.selectOptions(screen.getByLabelText("Instituição"), instituicao.id);
    await usuario.type(screen.getByLabelText("Agência"), "0003");
    await usuario.type(screen.getByLabelText("Número da conta"), "99999999");
    await usuario.click(screen.getByRole("button", { name: "Buscar" }));

    expect(await screen.findByText("J**** P****")).toBeInTheDocument();
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() =>
      expect(corpo).toEqual({
        source_account_id: conta.id,
        destination_account_id: "conta-nova",
        amount: "100.00",
      }),
    );
    // Transferir nao cria contato. O gateway nem liga um ao outro.
    expect(salvouContato).toBe(false);
  });

  it("valor acima do disponivel avisa mas NAO desabilita o botao", async () => {
    // O disponivel derivado pode estar MAIOR que o real (furo declarado na
    // secao 6 do spec da 3b). Bloquear no cliente barraria envio legitimo.
    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await screen.findByRole("option", { name: /Maria/ });
    await usuario.selectOptions(screen.getByLabelText("Destino"), contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "999999.00");

    expect(
      await screen.findByText(
        "O valor é maior que o disponível calculado. Você pode enviar mesmo assim — quem decide é o servidor.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();
  });

  it("saldo insuficiente do servidor aparece traduzido por codigo", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, () =>
        HttpResponse.json(
          {
            error: {
              code: "INSUFFICIENT_FUNDS",
              message: "nao mostre isto",
              details: { available: "50.00" },
            },
          },
          { status: 422 },
        ),
      ),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await screen.findByRole("option", { name: /Maria/ });
    await usuario.selectOptions(screen.getByLabelText("Destino"), contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(i18n.t("INSUFFICIENT_FUNDS", { ns: "errors" }));
    expect(alerta).not.toHaveTextContent("nao mostre isto");
  });

  it("transferir para a mesma conta mostra a mensagem propria", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, () =>
        HttpResponse.json(
          { error: { code: "SAME_ACCOUNT_TRANSFER", message: "", details: {} } },
          { status: 422 },
        ),
      ),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await screen.findByRole("option", { name: /Maria/ });
    await usuario.selectOptions(screen.getByLabelText("Destino"), contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("SAME_ACCOUNT_TRANSFER", { ns: "errors" }),
    );
  });

  it("reenviar o MESMO pedido usa a MESMA chave; mudar o valor gera outra", async () => {
    // O teste central da idempotencia na tela real: sem isto, um clique
    // duplo depois de uma falha de rede criaria duas transferencias.
    const chaves: string[] = [];
    let falhar = true;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, ({ request }) => {
        chaves.push(request.headers.get("Idempotency-Key") ?? "");
        if (falhar) {
          falhar = false;
          return HttpResponse.error();
        }
        return respostaTransacao(202);
      }),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await screen.findByRole("option", { name: /Maria/ });
    await usuario.selectOptions(screen.getByLabelText("Destino"), contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");

    await usuario.click(screen.getByRole("button", { name: "Enviar" }));
    await screen.findByRole("alert");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(chaves).toHaveLength(2));
    expect(chaves[0]).toBe(chaves[1]);
  });
});
```

- [ ] **Step 2: Rode o teste e confirme que falha**

Run: `npm test -- --run src/features/transaction/TransferPage.test.tsx`
Expected: FAIL, `Failed to resolve import "@/features/transaction/TransferPage"`.

- [ ] **Step 3: Acrescente o hook de transferência**

Em `src/features/transaction/queries.ts`, acrescente ao final:

```ts
export function useTransferir() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      entrada,
      chave,
    }: {
      entrada: { source_account_id: string; destination_account_id: string; amount: string };
      chave: string;
    }) => transferir(entrada, chave),
    onSuccess: (_resposta, variaveis) => {
      invalidarTudoDeConta(qc, variaveis.entrada.source_account_id);
    },
  });
}
```

E inclua `transferir` no import de `@/features/transaction/api`:

```ts
import { buscarTransacao, depositar, transferir } from "@/features/transaction/api";
```

- [ ] **Step 4: Escreva a página**

Crie `src/features/transaction/TransferPage.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useContas } from "@/features/account/queries";
import AccountLookup from "@/features/contact/AccountLookup";
import { useContatos } from "@/features/contact/queries";
import type { ResultadoBusca } from "@/features/contact/types";
import { usePendentesDeSaida } from "@/features/statement/queries";
import { useChaveDeIntencao } from "@/features/transaction/idempotency";
import { useTransferir } from "@/features/transaction/queries";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";
import { formatarDinheiro, paraCentavos } from "@/lib/money";

export default function TransferPage() {
  const { t, i18n } = useTranslation(["transaction", "contact", "errors"]);
  const navegar = useNavigate();
  const { data: contas } = useContas();
  const { data: contatos } = useContatos();
  const transferir = useTransferir();

  const [origemId, setOrigemId] = useState("");
  const [contatoId, setContatoId] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [achada, setAchada] = useState<ResultadoBusca | null>(null);
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  // As duas entradas terminam no mesmo lugar: um account_id, que e o que o
  // gateway pede. Contato e conveniencia da interface, nada mais.
  const destinoId =
    achada?.account_id ??
    (contatos ?? []).find((c) => c.id === contatoId)?.target_account.id ??
    "";

  const { chave, limparChave } = useChaveDeIntencao({
    source_account_id: origemId,
    destination_account_id: destinoId,
    amount: valor,
  });

  const origem = (contas ?? []).find((c) => c.id === origemId);
  const pendentes = usePendentesDeSaida(origemId);
  const disponivelCentavos =
    origem === undefined ? null : paraCentavos(origem.balance) - pendentes.centavos;
  const valorCentavos = (() => {
    try {
      return valor.trim() === "" ? null : paraCentavos(valor.trim());
    } catch {
      return null;
    }
  })();
  const acimaDoDisponivel =
    disponivelCentavos !== null && valorCentavos !== null && valorCentavos > disponivelCentavos;

  async function aoEnviar() {
    setErro(null);
    try {
      const { transacao, criadaAgora } = await transferir.mutateAsync({
        entrada: {
          source_account_id: origemId,
          destination_account_id: destinoId,
          amount: valor.trim(),
        },
        chave,
      });
      limparChave();
      navegar(`/transacoes/${transacao.id}`, {
        state: { criadaAgora, destinoNaoSalvo: achada?.account_id ?? null },
      });
    } catch (falha) {
      setErro(t(codigoTraduzivel(extrairErro(falha).code), { ns: "errors" }));
    }
  }

  const incompleto = origemId === "" || destinoId === "" || valor.trim() === "";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("transaction:transferTitle")}</h1>

      <div className="flex flex-col gap-2">
        <Label htmlFor="transferencia-origem">{t("transaction:source")}</Label>
        <select
          id="transferencia-origem"
          className="rounded border px-2 py-1"
          value={origemId}
          onChange={(evento) => setOrigemId(evento.target.value)}
        >
          <option value="" />
          {(contas ?? []).map((conta) => (
            <option key={conta.id} value={conta.id}>
              {conta.alias ?? conta.number} · {conta.institution.name}
            </option>
          ))}
        </select>
      </div>

      {disponivelCentavos !== null && (
        <p className="text-sm text-muted-foreground">
          {t("transaction:available")}: {formatarDinheiro(disponivelCentavos, i18n.language)}
        </p>
      )}

      {achada === null ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="transferencia-destino">{t("transaction:destination")}</Label>
          <select
            id="transferencia-destino"
            className="rounded border px-2 py-1"
            value={contatoId}
            onChange={(evento) => setContatoId(evento.target.value)}
          >
            <option value="" />
            {(contatos ?? []).map((contato) => (
              <option key={contato.id} value={contato.id}>
                {contato.alias} · {contato.target_account.holder_name}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={() => setBuscando(true)}>
            {t("transaction:newAccount")}
          </Button>
          {buscando && <AccountLookup onEncontrada={setAchada} />}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{t("contact:found")}</p>
          <p className="text-sm">{achada.holder_name}</p>
          <p className="text-sm">{achada.institution.name}</p>
          <Button
            variant="outline"
            onClick={() => {
              setAchada(null);
              setBuscando(false);
            }}
          >
            {t("contact:cancel")}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="transferencia-valor">{t("transaction:value")}</Label>
        <Input
          id="transferencia-valor"
          inputMode="decimal"
          value={valor}
          onChange={(evento) => setValor(evento.target.value)}
        />
      </div>

      {acimaDoDisponivel && (
        <Alert role="status">
          <AlertDescription>{t("transaction:overAvailable")}</AlertDescription>
        </Alert>
      )}

      {erro && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {/* O botao NAO desabilita por causa do disponivel: quem decide e o servidor. */}
      <Button onClick={() => void aoEnviar()} disabled={incompleto || transferir.isPending}>
        {transferir.isPending ? t("transaction:sending") : t("transaction:send")}
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Rode os testes e confirme que passam**

Run: `npm test -- --run`
Expected: PASS, 155 testes (149 anteriores + 6 novos).

- [ ] **Step 6: Prove que dois testes discriminam**

Primeiro, acrescente `|| acimaDoDisponivel` ao `disabled` do botão de enviar.

Run: `npm test -- --run src/features/transaction/TransferPage.test.tsx`
Expected: FAIL — `valor acima do disponivel avisa mas NAO desabilita o botao` falha.

**Restaure.** Depois, em `TransferPage.tsx`, troque a chamada de `useChaveDeIntencao` por `useChaveDeIntencao({ agora: Date.now() })`.

Run: `npm test -- --run src/features/transaction/TransferPage.test.tsx`
Expected: FAIL — `reenviar o MESMO pedido usa a MESMA chave` falha.

**Restaure o arquivo** e rode de novo. Expected: PASS, 6 testes.

- [ ] **Step 7: Commit**

```bash
git add src/features/transaction
git commit -m "feat: transferencia por contato salvo ou por busca na hora

O disponivel avisa e nao bloqueia: ele pode estar MAIOR que o real quando ha
mais de 100 transacoes depois de uma pendencia antiga, e barrar no cliente
recusaria envio legitimo. Quem decide e o gateway.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Salvar o destino como contato, a partir do recibo

**Files:**
- Modify: `src/features/transaction/TransactionReceiptPage.tsx`
- Test: `src/features/transaction/TransactionReceiptPage.test.tsx`

**Interfaces:**
- Consumes: `useSalvarContato` de `@/features/contact/queries`; o `destinoNaoSalvo` que a Task 7 põe no estado da navegação.
- Produces: nada novo para tasks seguintes.

**Por que aqui e não no formulário.** Depois do sucesso o usuário sabe que quer guardar aquele destino, e o `account_id` já está em mãos. Oferecer antes do envio seria pedir uma decisão sobre um destino que ele ainda não usou.

**Só aparece quando o destino veio de busca.** Se a transferência foi para um contato salvo, não há o que salvar. O `destinoNaoSalvo` no estado da navegação é `null` nesse caso.

- [ ] **Step 1: Escreva o teste**

Acrescente a `src/features/transaction/TransactionReceiptPage.test.tsx`, dentro do `describe("recibo", …)`:

```tsx
  it("oferece salvar o contato quando o destino veio de busca", async () => {
    let corpo: unknown = null;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () => HttpResponse.json(transacao())),
      mswHttp.post(`${URL_TESTE}/contacts`, async ({ request }) => {
        corpo = await request.json();
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    envolverComQuery(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/transacoes/tx-1",
            state: { criadaAgora: true, destinoNaoSalvo: "conta-nova" },
          },
        ]}
      >
        <Routes>
          <Route path="/transacoes/:id" element={<TransactionReceiptPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const usuario = userEvent.setup();
    await usuario.click(
      await screen.findByRole("button", { name: "Salvar destino como contato" }),
    );
    await usuario.type(await screen.findByLabelText("Apelido"), "Joao");
    await usuario.click(screen.getByRole("button", { name: "Salvar contato" }));

    await waitFor(() =>
      expect(corpo).toEqual({ account_id: "conta-nova", alias: "Joao", is_favorite: false }),
    );
  });

  it("NAO oferece salvar quando o destino ja era um contato", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () => HttpResponse.json(transacao())),
    );

    montar({ criadaAgora: true });

    await screen.findByText("Aceita, ainda não concluída");
    expect(
      screen.queryByRole("button", { name: "Salvar destino como contato" }),
    ).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Rode o teste e confirme que falha**

Run: `npm test -- --run src/features/transaction/TransactionReceiptPage.test.tsx`
Expected: FAIL — `oferece salvar o contato quando o destino veio de busca` não encontra o botão.

- [ ] **Step 3: Acrescente o bloco ao recibo**

Em `src/features/transaction/TransactionReceiptPage.tsx`, acrescente os imports:

```tsx
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSalvarContato } from "@/features/contact/queries";
```

Dentro do componente, junto dos outros hooks:

```tsx
  const salvarContato = useSalvarContato();
  const [salvandoContato, setSalvandoContato] = useState(false);
  const [aliasNovo, setAliasNovo] = useState("");
  const [erroContato, setErroContato] = useState<string | null>(null);

  // Só existe quando o destino veio de uma busca. Transferencia para
  // contato salvo nao tem o que salvar.
  const destinoNaoSalvo =
    (local.state as { destinoNaoSalvo?: string | null } | null)?.destinoNaoSalvo ?? null;
```

E, antes do bloco de botões:

```tsx
      {destinoNaoSalvo !== null && !salvandoContato && (
        <Button variant="outline" onClick={() => setSalvandoContato(true)}>
          {t("transaction:saveContact")}
        </Button>
      )}

      {destinoNaoSalvo !== null && salvandoContato && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="recibo-alias">{t("contact:alias")}</Label>
          <Input
            id="recibo-alias"
            maxLength={50}
            value={aliasNovo}
            onChange={(evento) => setAliasNovo(evento.target.value)}
          />
          {erroContato && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{erroContato}</AlertDescription>
            </Alert>
          )}
          <Button
            disabled={aliasNovo.trim() === "" || salvarContato.isPending}
            onClick={() => {
              setErroContato(null);
              void salvarContato
                .mutateAsync({
                  account_id: destinoNaoSalvo,
                  alias: aliasNovo.trim(),
                  is_favorite: false,
                })
                .then(() => setSalvandoContato(false))
                .catch((falha: unknown) => {
                  setErroContato(
                    t(codigoTraduzivel(extrairErro(falha).code), { ns: "errors" }),
                  );
                });
            }}
          >
            {t("contact:save")}
          </Button>
        </div>
      )}
```

Ajuste o `useTranslation` do topo para incluir o namespace `contact`:

```tsx
  const { t, i18n } = useTranslation(["transaction", "contact", "errors"]);
```

- [ ] **Step 4: Rode os testes e confirme que passam**

Run: `npm test -- --run`
Expected: PASS, 157 testes (155 anteriores + 2 novos).

- [ ] **Step 5: Commit**

```bash
git add src/features/transaction
git commit -m "feat: oferecer salvar o destino como contato depois da transferencia

So aparece quando o destino veio de busca: transferencia para contato salvo
nao tem o que salvar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Rotas, navegação, ponta a ponta e documentação

**Files:**
- Modify: `src/app/router.tsx`, `src/components/layout/AppShell.tsx`, `src/locales/pt-BR.json`, `src/locales/en.json`, `README.md`, `docs/superpowers/follow-ups-fatia-3b.md`
- Create: `tests/e2e/dinheiro.spec.ts`, `docs/superpowers/follow-ups-fatia-3c.md`
- Test: `src/app/router.test.tsx`

**Interfaces:**
- Consumes: `ContactsPage`, `TransferPage`, `DepositPage`, `TransactionReceiptPage`.
- Produces: as rotas `/contatos`, `/transferir`, `/depositar`, `/transacoes/:id`.

- [ ] **Step 1: Acrescente as chaves de navegação**

Em `src/locales/pt-BR.json`, dentro do bloco `common`:

```json
    "contacts": "Contatos",
    "transfer": "Transferir",
    "deposit": "Depositar",
```

Em `src/locales/en.json`, dentro do bloco `common`:

```json
    "contacts": "Contacts",
    "transfer": "Transfer",
    "deposit": "Deposit",
```

- [ ] **Step 2: Acrescente as quatro rotas**

Em `src/app/router.tsx`, antes da rota `path="*"`, acrescente as quatro, cada uma no mesmo formato das existentes:

```tsx
        <Route
          path="/contatos"
          element={
            autenticado ? (
              <AppShell>
                <ContactsPage />
              </AppShell>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/transferir"
          element={
            autenticado ? (
              <AppShell>
                <TransferPage />
              </AppShell>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/depositar"
          element={
            autenticado ? (
              <AppShell>
                <DepositPage />
              </AppShell>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/transacoes/:id"
          element={
            autenticado ? (
              <AppShell>
                <TransactionReceiptPage />
              </AppShell>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
```

E os imports no topo:

```tsx
import ContactsPage from "@/features/contact/ContactsPage";
import DepositPage from "@/features/transaction/DepositPage";
import TransactionReceiptPage from "@/features/transaction/TransactionReceiptPage";
import TransferPage from "@/features/transaction/TransferPage";
```

- [ ] **Step 3: Acrescente os itens de navegação**

Em `src/components/layout/AppShell.tsx`, dentro do `<nav>`, logo depois do `NavLink` de `/contas`, **com a mesma `className` dos que já estão lá**:

```tsx
          <NavLink to="/contatos" className="rounded px-2 py-1 hover:bg-muted">
            {t("common:contacts")}
          </NavLink>
          <NavLink to="/transferir" className="rounded px-2 py-1 hover:bg-muted">
            {t("common:transfer")}
          </NavLink>
          <NavLink to="/depositar" className="rounded px-2 py-1 hover:bg-muted">
            {t("common:deposit")}
          </NavLink>
```

**Cuidado com uma armadilha que a Fatia 3a já pagou:** o rótulo do menu e o título da página não podem ser o mesmo texto, senão `getByText` fica ambíguo no teste. Aqui o menu diz "Transferir" e o título da página também diz "Transferir" — por isso os testes de rota usam `getByRole("heading", …)`, nunca `getByText`.

- [ ] **Step 4: Escreva os testes de rota**

Em `src/app/router.test.tsx`, **dentro do `describe("rotas de conta", …)` que já existe**, acrescente os dois casos abaixo. Eles reusam o `montarAutenticado()` e o `beforeEach` daquele bloco, que já provisionam o `QueryClientProvider` e os handlers de `auth/refresh` e `auth/me` — sem isso, montar cai no erro `No QueryClient set`:

```tsx
  it("a rota /transferir monta a tela de transferencia", async () => {
    window.history.pushState({}, "", "/transferir");
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([])),
      mswHttp.get(`${URL_TESTE}/contacts`, () => HttpResponse.json([])),
    );

    montarAutenticado();

    expect(await screen.findByRole("heading", { name: "Transferir" })).toBeInTheDocument();
  });

  it("a rota /transacoes/:id monta o comprovante", async () => {
    window.history.pushState({}, "", "/transacoes/tx-1");
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () =>
        HttpResponse.json({
          id: "tx-1",
          type: "TRANSFER",
          status: "COMPLETED",
          amount: "10.00",
          source_account_id: "conta-1",
          destination_account_id: "conta-2",
          failure_reason: null,
          created_at: "2026-03-09T14:30:00Z",
        }),
      ),
    );

    montarAutenticado();

    expect(await screen.findByRole("heading", { name: "Comprovante" })).toBeInTheDocument();
  });
```

Renomeie o `describe` de `"rotas de conta"` para `"rotas de conta e dinheiro"`, já que ele deixou de cobrir só contas.

- [ ] **Step 5: Rode os testes e confirme que passam**

Run: `npm test -- --run`
Expected: PASS, 159 testes.

Run: `npm run build`
Expected: sucesso.

- [ ] **Step 6: Escreva o teste ponta a ponta**

Crie `tests/e2e/dinheiro.spec.ts`:

```ts
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
```

- [ ] **Step 7: Rode o teste ponta a ponta**

Suba o ambiente: `docker compose up -d` no repositório `nexuspay-api-gateway`, depois `uv run uvicorn app.main:app --port 8000` no mesmo repositório. O Docker Desktop desta máquina fica em `%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe`, não em `Program Files`.

Run: `npx playwright test`
Expected: 7 testes passando (5 anteriores + 2 novos).

**Se o gateway devolver 429**, é o limitador de taxa do registro: cada rodada cria usuários novos, e execuções seguidas o esgotam. Espere um minuto e rode de novo — não é defeito.

**Se você não conseguir subir o ambiente**, escreva o teste, declare no relatório que ele não foi executado e por quê, e siga. Nunca simule um gateway para fingir que o teste passou.

- [ ] **Step 8: Atualize a documentação**

No `README.md`, acrescente à seção de estado do servidor um parágrafo dizendo que transferência e depósito exigem o cabeçalho `Idempotency-Key`, que a chave é gerada por intenção e presa ao payload, que ela não é persistida, e que o comprovante em `/transacoes/:id` é o que responde "passou?" depois de um recarregamento.

Em `docs/superpowers/follow-ups-fatia-3b.md`, marque como **fechado** o item da paginação real do extrato no Playwright, apontando que a 3c criou transações de verdade.

Crie `docs/superpowers/follow-ups-fatia-3c.md`:

```markdown
# Follow-ups da Fatia 3c

## Expor o saldo disponível no gateway

Herdado da 3b e ainda aberto. O disponível continua derivado no cliente, com
o furo do `limit=100` declarado na §6 do spec da 3b: quando há mais de 100
transações depois de uma pendência antiga, o número exibido fica **maior**
que o real. Na 3c isso passou a alimentar o aviso não-bloqueante da
transferência, então o aviso pode não aparecer quando deveria. A correção é
expor o campo no `AccountOut`.

## O e2e desta fatia publica na fila SQS compartilhada

`tests/e2e/dinheiro.spec.ts` é o primeiro teste automatizado do projeto que
publica em `api-processar-transferencia-worker.fifo`, que é compartilhada
entre desenvolvimento e produção. Hoje a proteção é processual: só rodar
contra o ambiente local. A Fatia 4 precisa separar as filas de verdade, e
até lá este teste não pode entrar em automação que rode sozinha.

## O ciclo completo depende do worker

Sem o worker rodando, a transação fica em `PENDING` e o e2e verifica só até
o `202`. Um teste que provasse `COMPLETED` de ponta a ponta exigiria subir os
três serviços na mesma execução.

## Limite de 50 caracteres do apelido sem teste

Herdado da 3b, e agora também no apelido de contato: o limite existe só pelo
atributo HTML `maxLength`, sem teste. O gateway valida do lado dele.
```

- [ ] **Step 9: Commit**

```bash
git add src/app src/components src/locales tests/e2e README.md docs
git commit -m "feat: rotas de contato e transacao, navegacao, ponta a ponta e docs

O e2e desta fatia e o primeiro que publica na fila SQS compartilhada, e o
cabecalho do arquivo diz isso com todas as letras.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verificação final da fatia

Depois da Task 9, antes de qualquer merge:

- `npm test -- --run` — 159 testes
- `npm run build` — sucesso
- `npx playwright test` — 7 testes, com o ambiente no ar
- Paridade dos dois dicionários: nenhuma chave presente num e ausente no outro
- **Review da branch inteira**, com o modelo mais capaz disponível. Nas Fatias 2b e 3a ela foi pulada e as duas vezes achou defeito sério depois; na 3b ela foi feita e achou dois defeitos que as reviews por task não tinham como ver.
