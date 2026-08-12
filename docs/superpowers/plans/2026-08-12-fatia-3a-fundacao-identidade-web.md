# Fatia 3a — Fundação e identidade do cliente web: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o cliente React do NexusPay até o ponto em que dá para registrar, entrar, permanecer autenticado e sair — com a sessão se renovando sozinha e a interface em dois idiomas.

**Architecture:** Um cliente Axios com renovação de token em fila única resolve o problema central da fatia: o gateway revoga todas as sessões se receber dois `/auth/refresh` concorrentes. A sessão vive só em memória, restaurada na carga por um refresh silencioso contra o cookie `httpOnly`. Erros são traduzidos por código, nunca por mensagem.

**Tech Stack:** React 19.2.8, Vite 8.2.1, TypeScript 7.0.2, Tailwind 4.3.3, shadcn 4.17.0, Zustand 5.0.14, Axios 1.19.0, react-router 8.3.0, i18next 26.3.6, Vitest 4.1.10, MSW 2.15.0, Playwright 1.62.1.

**Spec:** `docs/superpowers/specs/2026-08-12-fatia-3a-fundacao-identidade-web-design.md`

## Global Constraints

- **Versões fixas, verificadas no registro do npm.** Não subir nenhuma durante a implementação.
- **O Vite roda na porta 5173 com `strictPort: true`.** O CORS do gateway libera exatamente `http://localhost:5173` e recusa `*`. Sem `strictPort`, o Vite cai silenciosamente para 5174 quando a porta está ocupada e todas as requisições passam a falhar por CORS — sintoma que não parece porta.
- **`react-router` na v8 se importa direto de `react-router`**, nunca de `react-router-dom`, que parou na 7.18.2 e é só um reexport.
- **Tailwind v4 é configuração em CSS.** Não existe `tailwind.config.js`; é o plugin `@tailwindcss/vite` mais `@import "tailwindcss";` no CSS de entrada.
- **O access token vive só em memória.** Nunca em `localStorage`, `sessionStorage` ou cookie escrito pelo JavaScript.
- **O refresh token nunca é lido pelo JavaScript.** Ele é um cookie `httpOnly` chamado `nexuspay_refresh`, com path `/api/v1/auth`. O cliente só precisa de `withCredentials: true`.
- **Erro é traduzido por `error.code`, nunca por `error.message`.**
- **Nenhuma string literal visível dentro de componente.** Tudo passa pelo i18next.
- **Dinheiro não aparece nesta fatia.** Saldo, contas e transações são a Fatia 3b.
- Commits em português, formato `tipo: descrição`, terminando com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

### Contrato da API, verificado no código do gateway

```
POST /api/v1/auth/register  -> 201 { access_token, token_type, expires_in, user }
POST /api/v1/auth/login     -> 200 { access_token, token_type, expires_in }   (5/minute por IP)
POST /api/v1/auth/refresh   -> 200 { access_token, token_type, expires_in }
POST /api/v1/auth/logout    -> 204
GET  /api/v1/auth/me        -> 200 { id, full_name, email, document, created_at }

erro (qualquer rota): { "error": { "code": "...", "message": "...", "details": {...} } }
```

## Estrutura de arquivos

```
vite.config.ts             plugins, alias, porta 5173, configuração do Vitest
tsconfig.json              alias @ -> ./src
components.json            configuração do shadcn
index.html
src/
  main.tsx                 monta o app
  index.css                @import "tailwindcss"
  test/setup.ts            jest-dom + servidor MSW
  test/msw.ts              setupServer e utilitários
  app/router.tsx           rotas, guarda, redirecionamentos
  app/i18n.ts              i18next
  lib/http.ts              Axios, interceptores, renovação em fila única
  lib/errors.ts            traduz erro por código
  components/ui/           gerado pelo shadcn
  components/layout/AppShell.tsx
  components/layout/LanguageSwitch.tsx
  features/auth/session.store.ts
  features/auth/api.ts
  features/auth/useSessionBootstrap.ts
  features/auth/LoginPage.tsx
  features/auth/RegisterPage.tsx
  pages/HomePage.tsx
  locales/en.json
  locales/pt-BR.json
tests/e2e/                 Playwright
```

---

### Task 1: Projeto, Tailwind, Vitest e shadcn

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `.gitignore` (ampliar), `components.json`
- Create: `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/test/setup.ts`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: alias `@` apontando para `src`; `npm test` roda Vitest com jsdom; `npm run dev` sobe na 5173; componentes shadcn disponíveis em `@/components/ui`.

- [ ] **Step 1: Criar o projeto e instalar as dependências**

```bash
npm create vite@latest . -- --template react-ts
npm pkg set name="nexuspay-web-client"
npm install react@19.2.8 react-dom@19.2.8
npm install axios@1.19.0 zustand@5.0.14 react-router@8.3.0
npm install i18next@26.3.6 react-i18next@17.0.11 i18next-browser-languagedetector@8.2.1
npm install react-hook-form@7.85.0 zod@4.4.3 @hookform/resolvers@5.7.1
npm install class-variance-authority@0.7.1 tailwind-merge@3.6.0 lucide-react@1.31.0
npm install -D vite@8.2.1 typescript@7.0.2 @vitejs/plugin-react@6.0.5
npm install -D tailwindcss@4.3.3 @tailwindcss/vite@4.3.3
npm install -D vitest@4.1.10 jsdom@30.0.1 @testing-library/react@16.3.2 @testing-library/jest-dom@7.0.1
npm install -D @testing-library/user-event@14.6.4
npm install -D msw@2.15.0 @playwright/test@1.62.1
```

Se `npm create vite` recusar rodar num diretório não vazio, responda para prosseguir mesmo assim — o repositório já tem `README.md`, `.gitignore` e `docs/`, e nenhum deles pode ser apagado.

- [ ] **Step 2: Escrever a configuração**

`vite.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    // strictPort e obrigatorio: o CORS do gateway libera exatamente
    // http://localhost:5173. Sem isso o Vite cai para 5174 quando a porta
    // esta ocupada, e toda requisicao passa a falhar por CORS — um sintoma
    // que nao se parece nem um pouco com "porta errada".
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // Fixa a URL nos testes. Sem isto, um .env local apontando para outro
    // host faria o cliente pedir num endereco e o MSW responder noutro — e a
    // falha apareceria como "requisicao nao mockada", que nao sugere .env.
    env: { VITE_API_URL: "http://localhost:8000/api/v1" },
  },
});
```

`defineConfig` vem de `vitest/config`, não de `vite` — é o que traz a tipagem do bloco `test`.

Em `tsconfig.json`, dentro de `compilerOptions`:

```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

`src/index.css` — o arquivo inteiro:

```css
@import "tailwindcss";
```

Tailwind v4 não tem `tailwind.config.js`. Se você sentir falta dele, não crie: personalização vive em CSS com `@theme`.

`src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Em `package.json`, os scripts:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "e2e": "playwright test"
}
```

- [ ] **Step 3: Escrever o teste que falha**

`src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import App from "@/App";

describe("App", () => {
  it("monta e renderiza a marca", () => {
    render(<App />);
    expect(screen.getByText("NexusPay")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `App` ainda não renderiza esse texto (o template do Vite traz outro conteúdo).

- [ ] **Step 5: Reduzir o App ao mínimo**

`src/App.tsx`:

```tsx
export default function App() {
  return <h1>NexusPay</h1>;
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Apague os restos do template: `src/App.css`, `src/assets/`, e as importações que sobraram.

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Instalar o shadcn e os componentes desta fatia**

```bash
npx shadcn@4.17.0 init
npx shadcn@4.17.0 add button input label card alert
```

No `init`, aceite o padrão de estilo e confirme que os componentes vão para `@/components/ui`. Isso cria `components.json` e acrescenta variáveis de tema ao `src/index.css` — as duas coisas são esperadas e devem ser versionadas.

- [ ] **Step 8: Confirmar que o projeto sobe e compila**

```bash
npm run build
```

Expected: build sem erro de tipo. Se `tsc -b` reclamar de `components/ui`, **não** desative a checagem — reporte, porque é sinal de incompatibilidade real entre as versões fixadas.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: projeto vite com tailwind 4, vitest e shadcn

strictPort na 5173 porque o CORS do gateway libera exatamente essa origem;
sem isso o Vite cai para 5174 e tudo falha por CORS.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Internacionalização

**Files:**
- Create: `src/app/i18n.ts`, `src/locales/en.json`, `src/locales/pt-BR.json`
- Modify: `src/main.tsx`
- Test: `src/app/i18n.test.ts`

**Interfaces:**
- Produces: i18next configurado com fallback `pt-BR`, detecção por navegador, persistência em `localStorage` sob a chave `nexuspay.lang`, e os espaços de nomes `common`, `auth` e `errors`.

- [ ] **Step 1: Escrever o teste que falha**

`src/app/i18n.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- i18n`
Expected: FAIL — o módulo não existe.

- [ ] **Step 3: Escrever os dicionários**

`src/locales/pt-BR.json`:

```json
{
  "common": {
    "brand": "NexusPay",
    "language": "Idioma",
    "logout": "Sair",
    "loading": "Carregando",
    "home": "Início"
  },
  "auth": {
    "login": {
      "title": "Entrar na sua conta",
      "email": "E-mail",
      "password": "Senha",
      "submit": "Entrar",
      "toRegister": "Criar uma conta"
    },
    "register": {
      "title": "Criar sua conta",
      "fullName": "Nome completo",
      "email": "E-mail",
      "document": "CPF",
      "password": "Senha",
      "submit": "Criar conta",
      "toLogin": "Já tenho conta"
    }
  },
  "errors": {}
}
```

`src/locales/en.json`:

```json
{
  "common": {
    "brand": "NexusPay",
    "language": "Language",
    "logout": "Sign out",
    "loading": "Loading",
    "home": "Home"
  },
  "auth": {
    "login": {
      "title": "Sign in to your account",
      "email": "Email",
      "password": "Password",
      "submit": "Sign in",
      "toRegister": "Create an account"
    },
    "register": {
      "title": "Create your account",
      "fullName": "Full name",
      "email": "Email",
      "document": "CPF",
      "password": "Password",
      "submit": "Create account",
      "toLogin": "I already have an account"
    }
  },
  "errors": {}
}
```

O espaço `errors` fica vazio de propósito: a Task 3 o preenche inteiro, e é lá que ele é verificado.

- [ ] **Step 4: Configurar o i18next**

`src/app/i18n.ts`:

```ts
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import ptBR from "@/locales/pt-BR.json";
import en from "@/locales/en.json";

export const IDIOMAS = ["pt-BR", "en"] as const;
export const CHAVE_IDIOMA = "nexuspay.lang";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { "pt-BR": ptBR, en },
    // pt-BR e o fallback porque o dominio e brasileiro: CPF, agencia, conta.
    fallbackLng: "pt-BR",
    supportedLngs: IDIOMAS,
    ns: ["common", "auth", "errors"],
    defaultNS: "common",
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: CHAVE_IDIOMA,
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
```

- [ ] **Step 5: Carregar o i18n na entrada**

Em `src/main.tsx`, acrescentar a importação **antes** de `App`:

```tsx
import "@/app/i18n";
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test`
Expected: PASS, incluindo o teste do App.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: i18n com pt-BR como fallback

O dominio e brasileiro — CPF, agencia, conta —, entao o fallback e pt-BR e
nao ingles. O idioma escolhido persiste em localStorage, que e preferencia e
nao segredo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Tradução de erro por código

**Files:**
- Create: `src/lib/errors.ts`
- Modify: `src/locales/en.json`, `src/locales/pt-BR.json` (preencher `errors`)
- Test: `src/lib/errors.test.ts`

**Interfaces:**
- Produces:
  - `CODIGOS_DE_ERRO: readonly string[]` — os 27 códigos do catálogo do gateway
  - `type ErroDaApi = { code: string; message: string; details: Record<string, unknown> }`
  - `extrairErro(erro: unknown) -> ErroDaApi` — normaliza qualquer falha, inclusive de rede
  - `chaveDeTraducao(code: string) -> string` — devolve `errors.<code>` quando conhecido, `errors.UNKNOWN` quando não, e registra o código desconhecido no console
  - `type CampoInvalido = { field: string; reason: string }`
  - `camposInvalidos(erro: ErroDaApi) -> CampoInvalido[]` — lê `details.fields` do `VALIDATION_ERROR`

- [ ] **Step 1: Escrever o teste que falha**

`src/lib/errors.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import i18n from "@/app/i18n";
import {
  CODIGOS_DE_ERRO,
  extrairErro,
  chaveDeTraducao,
  camposInvalidos,
} from "@/lib/errors";

function erroAxios(status: number, corpo: unknown): AxiosError {
  const erro = new AxiosError("falhou");
  erro.response = {
    status,
    statusText: "",
    data: corpo,
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  };
  return erro;
}

afterEach(() => vi.restoreAllMocks());

describe("catalogo de erro", () => {
  it("todo codigo tem traducao nos DOIS idiomas", () => {
    const semTraducao: string[] = [];
    for (const idioma of ["pt-BR", "en"]) {
      for (const codigo of CODIGOS_DE_ERRO) {
        const texto = i18n.getFixedT(idioma, "errors")(codigo);
        if (!texto || texto === codigo) semTraducao.push(`${idioma}:${codigo}`);
      }
    }
    expect(semTraducao).toEqual([]);
  });

  it("cobre os codigos que nascem nos handlers genericos do gateway", () => {
    // Estes tres nao vem de uma classe de excecao e sao os mais faceis de
    // esquecer — e aparecem justamente quando algo quebrou de verdade.
    expect(CODIGOS_DE_ERRO).toContain("NOT_FOUND");
    expect(CODIGOS_DE_ERRO).toContain("METHOD_NOT_ALLOWED");
    expect(CODIGOS_DE_ERRO).toContain("INTERNAL_ERROR");
  });

  it("tem 27 codigos", () => {
    expect(CODIGOS_DE_ERRO).toHaveLength(27);
  });
});

describe("extrairErro", () => {
  it("le o envelope do gateway", () => {
    const erro = extrairErro(
      erroAxios(422, { error: { code: "WEAK_PASSWORD", message: "x", details: {} } }),
    );
    expect(erro.code).toBe("WEAK_PASSWORD");
  });

  it("falha de rede vira NETWORK_ERROR em vez de estourar", () => {
    expect(extrairErro(new AxiosError("Network Error")).code).toBe("NETWORK_ERROR");
  });

  it("resposta fora do formato do envelope nao quebra", () => {
    expect(extrairErro(erroAxios(500, "<html>oops</html>")).code).toBe("INTERNAL_ERROR");
  });

  it("valor que nem e erro do axios nao quebra", () => {
    expect(extrairErro("qualquer coisa").code).toBe("INTERNAL_ERROR");
  });
});

describe("chaveDeTraducao", () => {
  it("devolve a chave do codigo conhecido", () => {
    expect(chaveDeTraducao("INVALID_CREDENTIALS")).toBe("errors.INVALID_CREDENTIALS");
  });

  it("codigo desconhecido cai no generico E vai para o console", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(chaveDeTraducao("CODIGO_QUE_NAO_EXISTE")).toBe("errors.UNKNOWN");
    // A divergencia entre gateway e cliente precisa APARECER, nao virar um
    // texto vago que ninguem investiga.
    expect(aviso).toHaveBeenCalledOnce();
  });
});

describe("camposInvalidos", () => {
  it("le details.fields do VALIDATION_ERROR", () => {
    const erro = extrairErro(
      erroAxios(422, {
        error: {
          code: "VALIDATION_ERROR",
          message: "x",
          details: { fields: [{ field: "email", reason: "invalido" }] },
        },
      }),
    );
    expect(camposInvalidos(erro)).toEqual([{ field: "email", reason: "invalido" }]);
  });

  it("devolve lista vazia quando nao ha details.fields", () => {
    const erro = extrairErro(
      erroAxios(401, { error: { code: "INVALID_CREDENTIALS", message: "x", details: {} } }),
    );
    expect(camposInvalidos(erro)).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- errors`
Expected: FAIL — o módulo não existe.

- [ ] **Step 3: Implementar**

`src/lib/errors.ts`:

```ts
import { AxiosError } from "axios";

/**
 * O catalogo do gateway, mantido a mao neste repositorio.
 *
 * Os 24 primeiros vem das classes de excecao de app/core/errors.py. Os tres
 * ultimos nascem nos manipuladores genericos do gateway — rota inexistente,
 * metodo nao suportado e qualquer excecao nao tratada — e por isso nao
 * aparecem numa busca por `raise`. Sao tambem os que surgem justamente
 * quando algo quebrou de verdade, entao esquece-los deixa o usuario com
 * mensagem generica no pior momento possivel.
 *
 * LIMITE CONHECIDO: esta lista nao se atualiza sozinha. O teste de
 * completude pega traducao faltando, mas nao pega codigo novo adicionado ao
 * gateway depois — para isso alguem precisa vir aqui.
 */
export const CODIGOS_DE_ERRO = [
  "INVALID_CREDENTIALS",
  "INVALID_TOKEN",
  "TOKEN_EXPIRED",
  "REFRESH_TOKEN_REUSED",
  "EMAIL_ALREADY_REGISTERED",
  "DOCUMENT_ALREADY_REGISTERED",
  "INVALID_DOCUMENT",
  "WEAK_PASSWORD",
  "ACCOUNT_NOT_FOUND",
  "ACCOUNT_HAS_BALANCE",
  "ACCOUNT_HAS_PENDING_TRANSACTIONS",
  "ACCOUNT_LIMIT_REACHED",
  "ACCOUNT_ALREADY_CLOSED",
  "ACCOUNT_NUMBER_GENERATION_FAILED",
  "INSTITUTION_NOT_FOUND",
  "CONTACT_NOT_FOUND",
  "CONTACT_OWN_ACCOUNT",
  "CONTACT_ALREADY_EXISTS",
  "RATE_LIMIT_EXCEEDED",
  "VALIDATION_ERROR",
  "TRANSACTION_NOT_FOUND",
  "INSUFFICIENT_FUNDS",
  "SAME_ACCOUNT_TRANSFER",
  "IDEMPOTENCY_KEY_REUSED",
  "NOT_FOUND",
  "METHOD_NOT_ALLOWED",
  "INTERNAL_ERROR",
] as const;

export type ErroDaApi = {
  code: string;
  message: string;
  details: Record<string, unknown>;
};

export type CampoInvalido = { field: string; reason: string };

const conhecidos = new Set<string>(CODIGOS_DE_ERRO);

/** Normaliza qualquer falha em um ErroDaApi. Nunca lanca. */
export function extrairErro(erro: unknown): ErroDaApi {
  if (erro instanceof AxiosError) {
    if (!erro.response) {
      // Sem resposta: DNS, offline, CORS, servidor fora. Nao e um codigo do
      // gateway, e merece mensagem propria — dizer "erro interno" aqui
      // manda o usuario procurar problema no lugar errado.
      return { code: "NETWORK_ERROR", message: erro.message, details: {} };
    }
    const corpo = erro.response.data as { error?: Partial<ErroDaApi> } | undefined;
    const envelope = corpo?.error;
    if (envelope?.code) {
      return {
        code: envelope.code,
        message: envelope.message ?? "",
        details: envelope.details ?? {},
      };
    }
  }
  return { code: "INTERNAL_ERROR", message: "", details: {} };
}

export function chaveDeTraducao(code: string): string {
  if (conhecidos.has(code) || code === "NETWORK_ERROR") {
    return `errors.${code}`;
  }
  console.warn(
    `[nexuspay] codigo de erro desconhecido vindo do gateway: ${code}. ` +
      `Acrescente-o a CODIGOS_DE_ERRO e aos dois dicionarios.`,
  );
  return "errors.UNKNOWN";
}

export function camposInvalidos(erro: ErroDaApi): CampoInvalido[] {
  const campos = erro.details?.fields;
  if (!Array.isArray(campos)) return [];
  return campos.filter(
    (c): c is CampoInvalido =>
      typeof c === "object" && c !== null && "field" in c && "reason" in c,
  );
}
```

- [ ] **Step 4: Preencher o espaço `errors` nos dois dicionários**

Em `src/locales/pt-BR.json`, substituir `"errors": {}` por:

```json
"errors": {
  "UNKNOWN": "Algo deu errado. Tente novamente.",
  "NETWORK_ERROR": "Não conseguimos falar com o servidor. Verifique sua conexão.",
  "INVALID_CREDENTIALS": "E-mail ou senha incorretos.",
  "INVALID_TOKEN": "Sua sessão não é válida. Entre novamente.",
  "TOKEN_EXPIRED": "Sua sessão expirou.",
  "REFRESH_TOKEN_REUSED": "Por segurança, todas as suas sessões foram encerradas. Entre novamente.",
  "EMAIL_ALREADY_REGISTERED": "Este e-mail já está cadastrado.",
  "DOCUMENT_ALREADY_REGISTERED": "Este CPF já está cadastrado.",
  "INVALID_DOCUMENT": "CPF inválido.",
  "WEAK_PASSWORD": "A senha precisa de ao menos 8 caracteres, com uma letra e um número.",
  "ACCOUNT_NOT_FOUND": "Conta não encontrada.",
  "ACCOUNT_HAS_BALANCE": "Não é possível encerrar uma conta com saldo.",
  "ACCOUNT_HAS_PENDING_TRANSACTIONS": "Não é possível encerrar a conta com transações pendentes.",
  "ACCOUNT_LIMIT_REACHED": "Você atingiu o limite de contas ativas.",
  "ACCOUNT_ALREADY_CLOSED": "Esta conta já está encerrada.",
  "ACCOUNT_NUMBER_GENERATION_FAILED": "Não conseguimos gerar o número da conta. Tente novamente.",
  "INSTITUTION_NOT_FOUND": "Instituição não encontrada.",
  "CONTACT_NOT_FOUND": "Contato não encontrado.",
  "CONTACT_OWN_ACCOUNT": "Você não pode adicionar a própria conta como contato.",
  "CONTACT_ALREADY_EXISTS": "Esta conta já está nos seus contatos.",
  "RATE_LIMIT_EXCEEDED": "Tentativas demais. Espere um minuto e tente de novo.",
  "VALIDATION_ERROR": "Confira os campos destacados.",
  "TRANSACTION_NOT_FOUND": "Transação não encontrada.",
  "INSUFFICIENT_FUNDS": "Saldo disponível insuficiente.",
  "SAME_ACCOUNT_TRANSFER": "A conta de origem e a de destino precisam ser diferentes.",
  "IDEMPOTENCY_KEY_REUSED": "Esta chave já foi usada com outros dados.",
  "NOT_FOUND": "Não encontramos o que você procurava.",
  "METHOD_NOT_ALLOWED": "Operação não permitida.",
  "INTERNAL_ERROR": "Algo deu errado do nosso lado. Tente novamente."
}
```

Em `src/locales/en.json`, substituir `"errors": {}` por:

```json
"errors": {
  "UNKNOWN": "Something went wrong. Please try again.",
  "NETWORK_ERROR": "We couldn't reach the server. Check your connection.",
  "INVALID_CREDENTIALS": "Incorrect email or password.",
  "INVALID_TOKEN": "Your session isn't valid. Please sign in again.",
  "TOKEN_EXPIRED": "Your session has expired.",
  "REFRESH_TOKEN_REUSED": "For your security, all your sessions were ended. Please sign in again.",
  "EMAIL_ALREADY_REGISTERED": "This email is already registered.",
  "DOCUMENT_ALREADY_REGISTERED": "This CPF is already registered.",
  "INVALID_DOCUMENT": "Invalid CPF.",
  "WEAK_PASSWORD": "Password needs at least 8 characters, with one letter and one digit.",
  "ACCOUNT_NOT_FOUND": "Account not found.",
  "ACCOUNT_HAS_BALANCE": "An account with a balance can't be closed.",
  "ACCOUNT_HAS_PENDING_TRANSACTIONS": "The account can't be closed while transactions are pending.",
  "ACCOUNT_LIMIT_REACHED": "You've reached the limit of active accounts.",
  "ACCOUNT_ALREADY_CLOSED": "This account is already closed.",
  "ACCOUNT_NUMBER_GENERATION_FAILED": "We couldn't generate the account number. Please try again.",
  "INSTITUTION_NOT_FOUND": "Institution not found.",
  "CONTACT_NOT_FOUND": "Contact not found.",
  "CONTACT_OWN_ACCOUNT": "You can't add your own account as a contact.",
  "CONTACT_ALREADY_EXISTS": "This account is already in your contacts.",
  "RATE_LIMIT_EXCEEDED": "Too many attempts. Wait a minute and try again.",
  "VALIDATION_ERROR": "Check the highlighted fields.",
  "TRANSACTION_NOT_FOUND": "Transaction not found.",
  "INSUFFICIENT_FUNDS": "Not enough available balance.",
  "SAME_ACCOUNT_TRANSFER": "Source and destination accounts must be different.",
  "IDEMPOTENCY_KEY_REUSED": "This key was already used with different data.",
  "NOT_FOUND": "We couldn't find what you were looking for.",
  "METHOD_NOT_ALLOWED": "Operation not allowed.",
  "INTERNAL_ERROR": "Something went wrong on our side. Please try again."
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Provar que o teste de completude detecta falta**

Remova a chave `INSUFFICIENT_FUNDS` de `src/locales/en.json` e rode `npm test -- errors`.
Expected: FAIL, apontando `en:INSUFFICIENT_FUNDS`. **Restaure** e confirme o verde.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: traducao de erro por codigo, nao por mensagem

Mensagem e texto do servidor: muda sem aviso, nao tem idioma e nao e
contrato. Codigo e.

O catalogo tem 27 codigos, nao 24: NOT_FOUND, METHOD_NOT_ALLOWED e
INTERNAL_ERROR nascem nos handlers genericos do gateway e nao aparecem numa
busca por raise — e sao os que surgem quando algo quebrou de verdade.

Codigo desconhecido cai no generico E vai para o console, para a divergencia
entre os repositorios aparecer em vez de virar texto vago.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Store de sessão

**Files:**
- Create: `src/features/auth/session.store.ts`
- Test: `src/features/auth/session.store.test.ts`

**Interfaces:**
- Produces:
  - `type Usuario = { id: string; full_name: string; email: string; document: string; created_at: string }`
  - `type StatusSessao = "booting" | "authenticated" | "anonymous"`
  - `useSession` (store Zustand) com `{ accessToken, user, status, autenticar(token, user), definirToken(token), encerrar(), marcarAnonimo() }`
  - `lerToken() -> string | null` — leitura fora de componente, para o interceptor

- [ ] **Step 1: Escrever o teste que falha**

`src/features/auth/session.store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useSession, lerToken } from "@/features/auth/session.store";

const usuario = {
  id: "11111111-1111-1111-1111-111111111111",
  full_name: "Joao Silva",
  email: "joao@example.com",
  document: "39053344705",
  created_at: "2026-08-12T00:00:00Z",
};

beforeEach(() => {
  useSession.setState({ accessToken: null, user: null, status: "booting" });
});

describe("store de sessao", () => {
  it("comeca em booting, nao em anonymous", () => {
    // A diferenca importa: em booting a interface mostra tela neutra; em
    // anonymous ela mostra o login. Comecar em anonymous faz a tela de login
    // piscar para quem esta autenticado.
    expect(useSession.getState().status).toBe("booting");
  });

  it("autenticar guarda token e usuario", () => {
    useSession.getState().autenticar("tok-123", usuario);
    const estado = useSession.getState();
    expect(estado.status).toBe("authenticated");
    expect(estado.accessToken).toBe("tok-123");
    expect(estado.user?.email).toBe("joao@example.com");
  });

  it("definirToken troca o token sem mexer no usuario", () => {
    useSession.getState().autenticar("tok-123", usuario);
    useSession.getState().definirToken("tok-456");
    expect(useSession.getState().accessToken).toBe("tok-456");
    expect(useSession.getState().user?.email).toBe("joao@example.com");
  });

  it("encerrar limpa tudo e vai para anonymous", () => {
    useSession.getState().autenticar("tok-123", usuario);
    useSession.getState().encerrar();
    const estado = useSession.getState();
    expect(estado.accessToken).toBeNull();
    expect(estado.user).toBeNull();
    expect(estado.status).toBe("anonymous");
  });

  it("lerToken enxerga o token de fora de componente", () => {
    useSession.getState().autenticar("tok-123", usuario);
    expect(lerToken()).toBe("tok-123");
  });

  it("nao persiste o token em storage nenhum", () => {
    useSession.getState().autenticar("tok-secreto", usuario);
    const tudo = JSON.stringify({ ...localStorage, ...sessionStorage });
    expect(tudo).not.toContain("tok-secreto");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- session.store`
Expected: FAIL — o módulo não existe.

- [ ] **Step 3: Implementar**

`src/features/auth/session.store.ts`:

```ts
import { create } from "zustand";

export type Usuario = {
  id: string;
  full_name: string;
  email: string;
  document: string;
  created_at: string;
};

export type StatusSessao = "booting" | "authenticated" | "anonymous";

type EstadoSessao = {
  accessToken: string | null;
  user: Usuario | null;
  status: StatusSessao;
  autenticar: (token: string, user: Usuario) => void;
  definirToken: (token: string) => void;
  encerrar: () => void;
  marcarAnonimo: () => void;
};

/**
 * O access token vive SO aqui, em memoria.
 *
 * Recarregar a pagina o perde, e tudo bem: o cookie httpOnly de refresh
 * sobrevive e o bootstrap restaura a sessao. Guardar em localStorage o
 * exporia a qualquer XSS sem ganhar nada que o cookie ja nao de.
 *
 * O status comeca em "booting" de proposito. Ele so vira "anonymous" quando
 * o refresh silencioso responder — antes disso a interface nao sabe, e
 * mostrar o login nesse intervalo o faz piscar para quem esta autenticado.
 */
export const useSession = create<EstadoSessao>((set) => ({
  accessToken: null,
  user: null,
  status: "booting",
  autenticar: (accessToken, user) => set({ accessToken, user, status: "authenticated" }),
  definirToken: (accessToken) => set({ accessToken }),
  encerrar: () => set({ accessToken: null, user: null, status: "anonymous" }),
  marcarAnonimo: () => set({ accessToken: null, user: null, status: "anonymous" }),
}));

/** Leitura fora de componente — o interceptor do Axios nao e um hook. */
export function lerToken(): string | null {
  return useSession.getState().accessToken;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- session.store`
Expected: PASS nos seis testes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: sessao em memoria com estado de boot

O access token nunca toca localStorage. O status comeca em booting e so vira
anonymous depois que o refresh silencioso responde — sem isso a tela de
login pisca para quem esta autenticado, defeito que so aparece com rede
lenta.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Cliente HTTP com renovação em fila única

O núcleo da fatia.

**Files:**
- Create: `src/lib/http.ts`, `src/test/msw.ts`
- Modify: `src/test/setup.ts`
- Test: `src/lib/http.test.ts`

**Interfaces:**
- Consumes: `lerToken`, `useSession` da Task 4.
- Produces:
  - `http` — instância Axios com `baseURL` de `VITE_API_URL`, `withCredentials: true`
  - `URL_BASE: string`

- [ ] **Step 1: Preparar o MSW**

`src/test/msw.ts`:

```ts
import { setupServer } from "msw/node";

export const servidor = setupServer();
export const URL_TESTE = "http://localhost:8000/api/v1";
```

`src/test/setup.ts` passa a ser:

```ts
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { servidor } from "./msw";

beforeAll(() => servidor.listen({ onUnhandledRequest: "error" }));
afterEach(() => servidor.resetHandlers());
afterAll(() => servidor.close());
```

`onUnhandledRequest: "error"` é deliberado: uma requisição que ninguém mockou deve quebrar o teste, não passar batido.

- [ ] **Step 2: Escrever o teste que falha**

`src/lib/http.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { http } from "@/lib/http";
import { servidor, URL_TESTE } from "@/test/msw";
import { useSession } from "@/features/auth/session.store";
import { http as mswHttp, HttpResponse } from "msw";

const usuario = {
  id: "11111111-1111-1111-1111-111111111111",
  full_name: "Joao Silva",
  email: "joao@example.com",
  document: "39053344705",
  created_at: "2026-08-12T00:00:00Z",
};

function envelope(code: string) {
  return { error: { code, message: "x", details: {} } };
}

beforeEach(() => {
  useSession.setState({ accessToken: "expirado", user: usuario, status: "authenticated" });
});

describe("cliente http", () => {
  it("anexa o token do store no cabecalho", async () => {
    useSession.getState().definirToken("tok-abc");
    let recebido: string | null = null;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, ({ request }) => {
        recebido = request.headers.get("authorization");
        return HttpResponse.json([]);
      }),
    );

    await http.get("/accounts");

    expect(recebido).toBe("Bearer tok-abc");
  });

  it("renova e repete quando o token expirou", async () => {
    let jaFalhou = false;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ access_token: "tok-novo", token_type: "bearer", expires_in: 900 }),
      ),
      mswHttp.get(`${URL_TESTE}/accounts`, ({ request }) => {
        if (!jaFalhou) {
          jaFalhou = true;
          return HttpResponse.json(envelope("TOKEN_EXPIRED"), { status: 401 });
        }
        return HttpResponse.json([{ ok: request.headers.get("authorization") }]);
      }),
    );

    const resposta = await http.get("/accounts");

    expect(resposta.data[0].ok).toBe("Bearer tok-novo");
    expect(useSession.getState().accessToken).toBe("tok-novo");
  });

  it("VARIAS requisicoes concorrentes disparam UM UNICO refresh", async () => {
    // ESTE E O TESTE MAIS IMPORTANTE DA FATIA.
    //
    // O gateway rotaciona o refresh token e detecta reuso revogando TODAS as
    // sessoes. Dois /auth/refresh concorrentes, disparados pelo proprio
    // cliente, deslogam o usuario de tudo. E duas requisicoes em paralelo
    // tomando 401 ao mesmo tempo e o caso NORMAL de qualquer tela que
    // carregue mais de um recurso.
    let refreshes = 0;
    const expirados = new Set<string>();
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, async () => {
        refreshes += 1;
        await new Promise((r) => setTimeout(r, 20));
        return HttpResponse.json({ access_token: "tok-novo", token_type: "bearer", expires_in: 900 });
      }),
      mswHttp.get(`${URL_TESTE}/r/:id`, ({ params, request }) => {
        const id = String(params.id);
        if (!expirados.has(id)) {
          expirados.add(id);
          return HttpResponse.json(envelope("TOKEN_EXPIRED"), { status: 401 });
        }
        return HttpResponse.json({ id, auth: request.headers.get("authorization") });
      }),
    );

    const respostas = await Promise.all([
      http.get("/r/1"),
      http.get("/r/2"),
      http.get("/r/3"),
      http.get("/r/4"),
    ]);

    expect(refreshes).toBe(1);
    for (const r of respostas) {
      expect(r.data.auth).toBe("Bearer tok-novo");
    }
  });

  it("nao entra em laco quando a repeticao tambem toma 401", async () => {
    let chamadas = 0;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ access_token: "tok-novo", token_type: "bearer", expires_in: 900 }),
      ),
      mswHttp.get(`${URL_TESTE}/accounts`, () => {
        chamadas += 1;
        return HttpResponse.json(envelope("TOKEN_EXPIRED"), { status: 401 });
      }),
    );

    await expect(http.get("/accounts")).rejects.toBeDefined();
    // uma original e uma unica repeticao — nunca mais que isso
    expect(chamadas).toBe(2);
  });

  it("refresh que falha encerra a sessao", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json(envelope("INVALID_TOKEN"), { status: 401 }),
      ),
      mswHttp.get(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json(envelope("TOKEN_EXPIRED"), { status: 401 }),
      ),
    );

    await expect(http.get("/accounts")).rejects.toBeDefined();
    expect(useSession.getState().status).toBe("anonymous");
  });

  it("REFRESH_TOKEN_REUSED encerra a sessao imediatamente, sem tentar renovar", async () => {
    let refreshes = 0;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () => {
        refreshes += 1;
        return HttpResponse.json({ access_token: "x", token_type: "bearer", expires_in: 900 });
      }),
      mswHttp.get(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json(envelope("REFRESH_TOKEN_REUSED"), { status: 401 }),
      ),
    );

    await expect(http.get("/accounts")).rejects.toBeDefined();
    expect(refreshes).toBe(0);
    expect(useSession.getState().status).toBe("anonymous");
  });

  it("401 que nao e de token nao dispara renovacao", async () => {
    let refreshes = 0;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () => {
        refreshes += 1;
        return HttpResponse.json({ access_token: "x", token_type: "bearer", expires_in: 900 });
      }),
      mswHttp.post(`${URL_TESTE}/auth/login`, () =>
        HttpResponse.json(envelope("INVALID_CREDENTIALS"), { status: 401 }),
      ),
    );

    await expect(http.post("/auth/login", {})).rejects.toBeDefined();
    // Senha errada nao e sessao expirada. Renovar aqui seria gastar o refresh
    // token a cada tentativa de login malsucedida.
    expect(refreshes).toBe(0);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -- http`
Expected: FAIL — o módulo não existe.

- [ ] **Step 4: Implementar**

`src/lib/http.ts`:

```ts
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { lerToken, useSession } from "@/features/auth/session.store";

export const URL_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1";

export const http = axios.create({
  baseURL: URL_BASE,
  // Obrigatorio: sem isso o cookie httpOnly de refresh nao viaja e o
  // /auth/refresh responde 401 para sempre.
  withCredentials: true,
});

type Requisicao = InternalAxiosRequestConfig & { _repetida?: boolean };

http.interceptors.request.use((config) => {
  const token = lerToken();
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  return config;
});

/**
 * A renovacao em voo, compartilhada por todas as requisicoes que falharem
 * enquanto ela nao resolver.
 *
 * Esta variavel e o coracao da fatia. O gateway rotaciona o refresh token a
 * cada uso e detecta reuso revogando TODAS as sessoes do usuario. Sem a
 * fila, duas requisicoes que tomam 401 juntas disparam dois /auth/refresh; o
 * segundo apresenta um token ja rotacionado, e o usuario e deslogado de
 * tudo. Duas requisicoes em paralelo e o caso normal, nao a excecao.
 */
let renovacaoEmVoo: Promise<string> | null = null;

async function pedirTokenNovo(): Promise<string> {
  // Instancia CRUA de proposito: usar `http` aqui faria o proprio
  // /auth/refresh passar pelo interceptor de resposta e tentar renovar a si
  // mesmo, em recursao.
  const resposta = await axios.post<{ access_token: string }>(
    `${URL_BASE}/auth/refresh`,
    null,
    { withCredentials: true },
  );
  return resposta.data.access_token;
}

function renovar(): Promise<string> {
  renovacaoEmVoo ??= pedirTokenNovo().finally(() => {
    renovacaoEmVoo = null;
  });
  return renovacaoEmVoo;
}

function codigoDe(erro: AxiosError): string {
  const corpo = erro.response?.data as { error?: { code?: string } } | undefined;
  return corpo?.error?.code ?? "";
}

http.interceptors.response.use(
  (resposta) => resposta,
  async (erro: AxiosError) => {
    const requisicao = erro.config as Requisicao | undefined;
    const codigo = codigoDe(erro);

    // Sessoes revogadas por seguranca: nao adianta renovar, e insistir
    // apresentaria de novo um token ja marcado como comprometido.
    if (codigo === "REFRESH_TOKEN_REUSED") {
      useSession.getState().encerrar();
      return Promise.reject(erro);
    }

    const renovavel =
      erro.response?.status === 401 &&
      codigo === "TOKEN_EXPIRED" &&
      requisicao !== undefined &&
      requisicao._repetida !== true &&
      // O proprio refresh nunca passa por aqui.
      !requisicao.url?.includes("/auth/refresh");

    if (!renovavel) return Promise.reject(erro);

    try {
      const token = await renovar();
      useSession.getState().definirToken(token);
      requisicao._repetida = true;
      return await http.request(requisicao);
    } catch {
      useSession.getState().encerrar();
      return Promise.reject(erro);
    }
  },
);
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- http`
Expected: PASS nos oito testes.

- [ ] **Step 6: Provar que a fila única é o que segura**

Remova o `??=` e faça `renovar()` sempre chamar `pedirTokenNovo()` diretamente. Rode `npm test -- http`.
Expected: FAIL em `VARIAS requisicoes concorrentes disparam UM UNICO refresh`, com `refreshes` igual a 4. **Restaure** e confirme o verde.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: cliente http com renovacao em fila unica

O gateway rotaciona o refresh token e detecta reuso revogando TODAS as
sessoes. Duas requisicoes que tomam 401 juntas disparariam dois
/auth/refresh, e o segundo derrubaria o usuario de tudo — e duas requisicoes
em paralelo e o caso normal de qualquer tela com mais de um recurso.

O refresh usa instancia crua do axios para nao passar pelo proprio
interceptor em recursao, e cada requisicao carrega marca de ja-repetida para
nao entrar em laco.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: API de autenticação e boot silencioso

**Files:**
- Create: `src/features/auth/api.ts`, `src/features/auth/useSessionBootstrap.ts`
- Test: `src/features/auth/useSessionBootstrap.test.tsx`

**Interfaces:**
- Consumes: `http`, `useSession`.
- Produces:
  - `registrar(dados: { full_name: string; email: string; document: string; password: string }) -> Promise<{ access_token: string; user: Usuario }>`
  - `entrar(dados: { email: string; password: string }) -> Promise<{ access_token: string }>`
  - `sair() -> Promise<void>`
  - `buscarUsuario() -> Promise<Usuario>`
  - `renovarNoBoot() -> Promise<string>` — renovação do boot, com instância crua do Axios
  - `useSessionBootstrap() -> void` — efeito que roda uma vez na carga

- [ ] **Step 1: Escrever o teste que falha**

`src/features/auth/useSessionBootstrap.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { useSession } from "@/features/auth/session.store";
import { useSessionBootstrap } from "@/features/auth/useSessionBootstrap";

const usuario = {
  id: "11111111-1111-1111-1111-111111111111",
  full_name: "Joao Silva",
  email: "joao@example.com",
  document: "39053344705",
  created_at: "2026-08-12T00:00:00Z",
};

beforeEach(() => {
  useSession.setState({ accessToken: null, user: null, status: "booting" });
});

describe("boot da sessao", () => {
  it("cookie valido restaura a sessao", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ access_token: "tok", token_type: "bearer", expires_in: 900 }),
      ),
      mswHttp.get(`${URL_TESTE}/auth/me`, () => HttpResponse.json(usuario)),
    );

    renderHook(() => useSessionBootstrap());

    await waitFor(() => expect(useSession.getState().status).toBe("authenticated"));
    expect(useSession.getState().user?.email).toBe("joao@example.com");
  });

  it("sem cookie vai para anonymous", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ error: { code: "INVALID_TOKEN", message: "x", details: {} } }, { status: 401 }),
      ),
    );

    renderHook(() => useSessionBootstrap());

    await waitFor(() => expect(useSession.getState().status).toBe("anonymous"));
  });

  it("permanece em booting ate a resposta chegar", async () => {
    let liberar: (() => void) | null = null;
    const espera = new Promise<void>((r) => (liberar = r));
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, async () => {
        await espera;
        return HttpResponse.json({ access_token: "tok", token_type: "bearer", expires_in: 900 });
      }),
      mswHttp.get(`${URL_TESTE}/auth/me`, () => HttpResponse.json(usuario)),
    );

    renderHook(() => useSessionBootstrap());

    // O intervalo entre a carga e a resposta e exatamente onde a tela de
    // login pisca se o status virar anonymous cedo demais.
    expect(useSession.getState().status).toBe("booting");
    liberar!();
    await waitFor(() => expect(useSession.getState().status).toBe("authenticated"));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- useSessionBootstrap`
Expected: FAIL — os módulos não existem.

- [ ] **Step 3: Implementar a API**

`src/features/auth/api.ts`:

```ts
import axios from "axios";
import { http, URL_BASE } from "@/lib/http";
import type { Usuario } from "@/features/auth/session.store";

type RespostaToken = { access_token: string; token_type: string; expires_in: number };

export async function registrar(dados: {
  full_name: string;
  email: string;
  document: string;
  password: string;
}): Promise<{ access_token: string; user: Usuario }> {
  const { data } = await http.post<RespostaToken & { user: Usuario }>("/auth/register", dados);
  return { access_token: data.access_token, user: data.user };
}

export async function entrar(dados: { email: string; password: string }): Promise<{ access_token: string }> {
  const { data } = await http.post<RespostaToken>("/auth/login", dados);
  return { access_token: data.access_token };
}

export async function sair(): Promise<void> {
  await http.post("/auth/logout");
}

export async function buscarUsuario(): Promise<Usuario> {
  const { data } = await http.get<Usuario>("/auth/me");
  return data;
}

/**
 * Renovacao do boot, com instancia crua.
 *
 * Nao usa `http` porque o 401 esperado aqui — cookie ausente ou expirado —
 * nao deve acionar o interceptor de renovacao: nao ha sessao a renovar, e o
 * caminho correto e simplesmente concluir que o usuario e anonimo.
 */
export async function renovarNoBoot(): Promise<string> {
  const { data } = await axios.post<RespostaToken>(`${URL_BASE}/auth/refresh`, null, {
    withCredentials: true,
  });
  return data.access_token;
}
```

- [ ] **Step 4: Implementar o bootstrap**

`src/features/auth/useSessionBootstrap.ts`:

```ts
import { useEffect, useRef } from "react";
import { useSession } from "@/features/auth/session.store";
import { buscarUsuario, renovarNoBoot } from "@/features/auth/api";

/**
 * Tenta restaurar a sessao a partir do cookie httpOnly, uma unica vez.
 *
 * O guarda de execucao unica importa: em StrictMode o React monta, desmonta
 * e remonta em desenvolvimento, e sem ele o boot dispararia DOIS
 * /auth/refresh concorrentes — exatamente o cenario que revoga todas as
 * sessoes do usuario.
 */
export function useSessionBootstrap(): void {
  const jaRodou = useRef(false);

  useEffect(() => {
    if (jaRodou.current) return;
    jaRodou.current = true;

    void (async () => {
      try {
        const token = await renovarNoBoot();
        useSession.getState().definirToken(token);
        const usuario = await buscarUsuario();
        useSession.getState().autenticar(token, usuario);
      } catch {
        useSession.getState().marcarAnonimo();
      }
    })();
  }, []);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test`
Expected: PASS em toda a suíte.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: api de auth e boot silencioso da sessao

O boot tem guarda de execucao unica porque o StrictMode monta duas vezes em
desenvolvimento, e dois /auth/refresh concorrentes revogam todas as sessoes
— o defeito apareceria so na maquina de quem desenvolve, que e onde ele
menos parece um defeito.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Telas de login e registro

**Files:**
- Create: `src/features/auth/LoginPage.tsx`, `src/features/auth/RegisterPage.tsx`
- Test: `src/features/auth/LoginPage.test.tsx`, `src/features/auth/RegisterPage.test.tsx`

**Interfaces:**
- Consumes: `entrar`, `registrar`, `buscarUsuario`, `useSession`, `extrairErro`, `chaveDeTraducao`, `camposInvalidos`.
- Produces: `LoginPage`, `RegisterPage` — componentes sem props.

- [ ] **Step 1: Escrever o teste de login que falha**

`src/features/auth/LoginPage.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { useSession } from "@/features/auth/session.store";
import LoginPage from "@/features/auth/LoginPage";
import i18n from "@/app/i18n";

const usuario = {
  id: "11111111-1111-1111-1111-111111111111",
  full_name: "Joao Silva",
  email: "joao@example.com",
  document: "39053344705",
  created_at: "2026-08-12T00:00:00Z",
};

function montar() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({ accessToken: null, user: null, status: "anonymous" });
});

describe("tela de login", () => {
  it("credencial correta autentica", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/login`, () =>
        HttpResponse.json({ access_token: "tok", token_type: "bearer", expires_in: 900 }),
      ),
      mswHttp.get(`${URL_TESTE}/auth/me`, () => HttpResponse.json(usuario)),
    );
    montar();

    await userEvent.type(screen.getByLabelText("E-mail"), "joao@example.com");
    await userEvent.type(screen.getByLabelText("Senha"), "senha123");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(useSession.getState().status).toBe("authenticated");
  });

  it("credencial errada mostra a mensagem traduzida, nao a do servidor", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/login`, () =>
        HttpResponse.json(
          { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password", details: {} } },
          { status: 401 },
        ),
      ),
    );
    montar();

    await userEvent.type(screen.getByLabelText("E-mail"), "joao@example.com");
    await userEvent.type(screen.getByLabelText("Senha"), "errada");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("E-mail ou senha incorretos.");
    // A mensagem do servidor esta em ingles e nao e contrato.
    expect(screen.queryByText("Invalid email or password")).not.toBeInTheDocument();
  });

  it("limite de tentativas tem mensagem propria, nao a generica", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/login`, () =>
        HttpResponse.json(
          { error: { code: "RATE_LIMIT_EXCEEDED", message: "x", details: {} } },
          { status: 429 },
        ),
      ),
    );
    montar();

    await userEvent.type(screen.getByLabelText("E-mail"), "joao@example.com");
    await userEvent.type(screen.getByLabelText("Senha"), "senha123");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    // O limite e 5/minuto e e atingido por quem so errou a senha algumas
    // vezes — o caso mais comum de todos.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tentativas demais. Espere um minuto e tente de novo.",
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- LoginPage`
Expected: FAIL — o componente não existe.

- [ ] **Step 3: Implementar o login**

`src/features/auth/LoginPage.tsx`:

```tsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { entrar, buscarUsuario } from "@/features/auth/api";
import { useSession } from "@/features/auth/session.store";
import { chaveDeTraducao, extrairErro } from "@/lib/errors";

const esquema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

type Campos = z.infer<typeof esquema>;

export default function LoginPage() {
  const { t } = useTranslation(["auth", "errors", "common"]);
  const [erro, setErro] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Campos>({
    resolver: zodResolver(esquema),
  });

  async function aoEnviar(campos: Campos) {
    setErro(null);
    try {
      const { access_token } = await entrar(campos);
      useSession.getState().definirToken(access_token);
      const usuario = await buscarUsuario();
      useSession.getState().autenticar(access_token, usuario);
    } catch (falha) {
      setErro(t(chaveDeTraducao(extrairErro(falha).code), { ns: "errors" }));
    }
  }

  return (
    <Card className="mx-auto mt-16 w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("auth:login.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(aoEnviar)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("auth:login.email")}</Label>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t("auth:login.password")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register("password")}
            />
          </div>

          {erro !== null && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={formState.isSubmitting}>
            {t("auth:login.submit")}
          </Button>
          <Link to="/register" className="text-sm underline">
            {t("auth:login.toRegister")}
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Escrever o teste de registro que falha**

`src/features/auth/RegisterPage.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { useSession } from "@/features/auth/session.store";
import RegisterPage from "@/features/auth/RegisterPage";
import i18n from "@/app/i18n";

const usuario = {
  id: "11111111-1111-1111-1111-111111111111",
  full_name: "Joao Silva",
  email: "joao@example.com",
  document: "39053344705",
  created_at: "2026-08-12T00:00:00Z",
};

function montar() {
  return render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>,
  );
}

async function preencher() {
  await userEvent.type(screen.getByLabelText("Nome completo"), "Joao Silva");
  await userEvent.type(screen.getByLabelText("E-mail"), "joao@example.com");
  await userEvent.type(screen.getByLabelText("CPF"), "39053344705");
  await userEvent.type(screen.getByLabelText("Senha"), "senha123");
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({ accessToken: null, user: null, status: "anonymous" });
});

describe("tela de registro", () => {
  it("registrar autentica direto, sem passar pelo login", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/register`, () =>
        HttpResponse.json(
          { access_token: "tok", token_type: "bearer", expires_in: 900, user: usuario },
          { status: 201 },
        ),
      ),
    );
    montar();
    await preencher();

    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    // A rota ja devolve token e seta o cookie — nao ha segundo passo.
    expect(await screen.findByRole("button", { name: "Criar conta" })).toBeInTheDocument();
    expect(useSession.getState().status).toBe("authenticated");
  });

  it("CPF ja cadastrado mostra a mensagem certa", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/register`, () =>
        HttpResponse.json(
          { error: { code: "DOCUMENT_ALREADY_REGISTERED", message: "x", details: {} } },
          { status: 409 },
        ),
      ),
    );
    montar();
    await preencher();

    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Este CPF já está cadastrado.");
  });

  it("VALIDATION_ERROR marca o campo apontado pelo servidor", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/register`, () =>
        HttpResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "x",
              details: { fields: [{ field: "document", reason: "não é um CPF válido" }] },
            },
          },
          { status: 422 },
        ),
      ),
    );
    montar();
    await preencher();

    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByText("não é um CPF válido")).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Implementar o registro**

`src/features/auth/RegisterPage.tsx`:

```tsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { registrar } from "@/features/auth/api";
import { useSession } from "@/features/auth/session.store";
import { camposInvalidos, chaveDeTraducao, extrairErro } from "@/lib/errors";

const esquema = z.object({
  full_name: z.string().min(1),
  email: z.string().email(),
  document: z.string().min(11),
  password: z.string().min(8),
});

type Campos = z.infer<typeof esquema>;

export default function RegisterPage() {
  const { t } = useTranslation(["auth", "errors"]);
  const [erro, setErro] = useState<string | null>(null);
  const { register, handleSubmit, formState, setError } = useForm<Campos>({
    resolver: zodResolver(esquema),
  });

  async function aoEnviar(campos: Campos) {
    setErro(null);
    try {
      const { access_token, user } = await registrar(campos);
      // A rota de registro ja devolve token e seta o cookie: entra direto.
      useSession.getState().autenticar(access_token, user);
    } catch (falha) {
      const problema = extrairErro(falha);
      const campos_ = camposInvalidos(problema);
      if (campos_.length > 0) {
        for (const c of campos_) {
          setError(c.field as keyof Campos, { message: c.reason });
        }
        return;
      }
      setErro(t(chaveDeTraducao(problema.code), { ns: "errors" }));
    }
  }

  const campos: Array<{ nome: keyof Campos; rotulo: string; tipo: string; auto: string }> = [
    { nome: "full_name", rotulo: t("auth:register.fullName"), tipo: "text", auto: "name" },
    { nome: "email", rotulo: t("auth:register.email"), tipo: "email", auto: "email" },
    { nome: "document", rotulo: t("auth:register.document"), tipo: "text", auto: "off" },
    { nome: "password", rotulo: t("auth:register.password"), tipo: "password", auto: "new-password" },
  ];

  return (
    <Card className="mx-auto mt-16 w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("auth:register.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(aoEnviar)} className="flex flex-col gap-4" noValidate>
          {campos.map((campo) => (
            <div key={campo.nome} className="flex flex-col gap-2">
              <Label htmlFor={campo.nome}>{campo.rotulo}</Label>
              <Input
                id={campo.nome}
                type={campo.tipo}
                autoComplete={campo.auto}
                aria-describedby={`${campo.nome}-erro`}
                {...register(campo.nome)}
              />
              <p id={`${campo.nome}-erro`} className="text-sm text-destructive">
                {formState.errors[campo.nome]?.message}
              </p>
            </div>
          ))}

          {erro !== null && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={formState.isSubmitting}>
            {t("auth:register.submit")}
          </Button>
          <Link to="/login" className="text-sm underline">
            {t("auth:register.toLogin")}
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Rodar a suíte**

Run: `npm test`
Expected: PASS em toda a suíte.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: telas de login e registro

Registrar autentica direto: a rota do gateway ja devolve token e seta o
cookie, entao nao ha segundo passo.

O 429 do limite de login tem mensagem propria — ele e atingido por quem so
errou a senha algumas vezes, que e o caso mais comum, e cair no generico ali
seria pessimo justamente com quem ja esta frustrado.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Roteamento, guarda e casca autenticada

**Files:**
- Create: `src/app/router.tsx`, `src/components/layout/AppShell.tsx`, `src/components/layout/LanguageSwitch.tsx`, `src/pages/HomePage.tsx`
- Modify: `src/App.tsx`, `src/App.test.tsx`
- Test: `src/app/router.test.tsx`

**Interfaces:**
- Consumes: `useSession`, `useSessionBootstrap`, `LoginPage`, `RegisterPage`, `sair`.
- Produces: `App` renderiza o roteador inteiro; rota `/` protegida; `/login` e `/register` públicas.

- [ ] **Step 1: Escrever o teste que falha**

`src/app/router.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { useSession } from "@/features/auth/session.store";
import App from "@/App";
import i18n from "@/app/i18n";

const usuario = {
  id: "11111111-1111-1111-1111-111111111111",
  full_name: "Joao Silva",
  email: "joao@example.com",
  document: "39053344705",
  created_at: "2026-08-12T00:00:00Z",
};

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({ accessToken: null, user: null, status: "booting" });
  window.history.pushState({}, "", "/");
});

describe("roteamento", () => {
  it("em booting mostra tela neutra, NUNCA o login", async () => {
    let liberar: (() => void) | null = null;
    const espera = new Promise<void>((r) => (liberar = r));
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, async () => {
        await espera;
        return HttpResponse.json({ access_token: "tok", token_type: "bearer", expires_in: 900 });
      }),
      mswHttp.get(`${URL_TESTE}/auth/me`, () => HttpResponse.json(usuario)),
    );

    render(<App />);

    // Este e o defeito classico da arquitetura: piscar o login para quem
    // esta autenticado. Nao aparece em desenvolvimento, so com rede lenta.
    expect(screen.queryByText("Entrar na sua conta")).not.toBeInTheDocument();
    expect(screen.getByText("Carregando")).toBeInTheDocument();

    liberar!();
    await waitFor(() => expect(screen.getByText("Início")).toBeInTheDocument());
  });

  it("sem sessao leva ao login", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ error: { code: "INVALID_TOKEN", message: "x", details: {} } }, { status: 401 }),
      ),
    );

    render(<App />);

    expect(await screen.findByText("Entrar na sua conta")).toBeInTheDocument();
  });

  it("trocar o idioma troca o texto visivel", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ access_token: "tok", token_type: "bearer", expires_in: 900 }),
      ),
      mswHttp.get(`${URL_TESTE}/auth/me`, () => HttpResponse.json(usuario)),
    );

    render(<App />);
    await screen.findByText("Início");

    await userEvent.selectOptions(screen.getByLabelText("Idioma"), "en");

    await waitFor(() => expect(screen.getByText("Home")).toBeInTheDocument());
  });

  it("sair revoga a sessao e volta ao login", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ access_token: "tok", token_type: "bearer", expires_in: 900 }),
      ),
      mswHttp.get(`${URL_TESTE}/auth/me`, () => HttpResponse.json(usuario)),
      mswHttp.post(`${URL_TESTE}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
    );

    render(<App />);
    await screen.findByText("Início");

    await userEvent.click(screen.getByRole("button", { name: "Sair" }));

    expect(await screen.findByText("Entrar na sua conta")).toBeInTheDocument();
    expect(useSession.getState().status).toBe("anonymous");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- router`
Expected: FAIL.

- [ ] **Step 3: Implementar o seletor de idioma**

`src/components/layout/LanguageSwitch.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { IDIOMAS } from "@/app/i18n";

const NOMES: Record<string, string> = { "pt-BR": "Português", en: "English" };

export default function LanguageSwitch() {
  const { i18n, t } = useTranslation("common");

  return (
    <label className="flex items-center gap-2 text-sm">
      {t("common:language")}
      <select
        aria-label={t("common:language")}
        value={i18n.resolvedLanguage}
        onChange={(evento) => void i18n.changeLanguage(evento.target.value)}
        className="rounded border px-2 py-1"
      >
        {IDIOMAS.map((idioma) => (
          <option key={idioma} value={idioma}>
            {NOMES[idioma]}
          </option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 4: Implementar a casca e a página inicial**

`src/components/layout/AppShell.tsx`:

```tsx
import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import LanguageSwitch from "@/components/layout/LanguageSwitch";
import { sair } from "@/features/auth/api";
import { useSession } from "@/features/auth/session.store";

export default function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation("common");

  async function aoSair() {
    try {
      await sair();
    } finally {
      // Encerra localmente mesmo se a chamada falhar: deixar o usuario
      // preso numa sessao que ele pediu para encerrar e pior do que uma
      // revogacao que so acontece quando o refresh token expirar.
      useSession.getState().encerrar();
    }
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r p-4 md:block">
        <p className="mb-6 text-lg font-semibold">{t("common:brand")}</p>
        <nav className="flex flex-col gap-1">
          <NavLink to="/" className="rounded px-2 py-1 hover:bg-muted">
            {t("common:home")}
          </NavLink>
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-4 border-b p-4">
          <LanguageSwitch />
          <Button variant="outline" onClick={() => void aoSair()}>
            {t("common:logout")}
          </Button>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
```

`src/pages/HomePage.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { useSession } from "@/features/auth/session.store";

export default function HomePage() {
  const { t } = useTranslation("common");
  const usuario = useSession((estado) => estado.user);

  return (
    <section>
      <h1 className="text-2xl font-semibold">{t("common:home")}</h1>
      <p className="mt-2 text-muted-foreground">{usuario?.full_name}</p>
    </section>
  );
}
```

A Fatia 3b preenche esta página. Ela **não** mostra saldo: saldo é dinheiro, e dinheiro é 3b.

- [ ] **Step 5: Implementar o roteador**

`src/app/router.tsx`:

```tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { useTranslation } from "react-i18next";
import { useSession } from "@/features/auth/session.store";
import { useSessionBootstrap } from "@/features/auth/useSessionBootstrap";
import LoginPage from "@/features/auth/LoginPage";
import RegisterPage from "@/features/auth/RegisterPage";
import HomePage from "@/pages/HomePage";
import AppShell from "@/components/layout/AppShell";

function TelaDeCarga() {
  const { t } = useTranslation("common");
  return <p className="p-8 text-center">{t("common:loading")}</p>;
}

export default function Router() {
  useSessionBootstrap();
  const status = useSession((estado) => estado.status);

  // Enquanto o refresh silencioso nao responder, nao existe resposta certa
  // para "esta autenticado?" — e chutar que nao faz o login piscar.
  if (status === "booting") return <TelaDeCarga />;

  const autenticado = status === "authenticated";

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={autenticado ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route
          path="/register"
          element={autenticado ? <Navigate to="/" replace /> : <RegisterPage />}
        />
        <Route
          path="/"
          element={
            autenticado ? (
              <AppShell>
                <HomePage />
              </AppShell>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to={autenticado ? "/" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

`src/App.tsx`:

```tsx
import Router from "@/app/router";

export default function App() {
  return <Router />;
}
```

- [ ] **Step 6: Ajustar o teste do App da Task 1**

O `src/App.test.tsx` da Task 1 assere que a marca aparece. Agora o `App` monta o roteador, que começa em `booting`. Substitua o arquivo inteiro por:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { useSession } from "@/features/auth/session.store";
import App from "@/App";

beforeEach(() => {
  useSession.setState({ accessToken: null, user: null, status: "booting" });
});

describe("App", () => {
  it("monta e mostra a tela de carga enquanto decide a sessao", () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ error: { code: "INVALID_TOKEN", message: "x", details: {} } }, { status: 401 }),
      ),
    );

    render(<App />);

    expect(screen.getByText("Carregando")).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npm test`
Expected: PASS em toda a suíte.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: roteamento, guarda de sessao e casca autenticada

Enquanto o boot nao responde nao existe resposta certa para 'esta
autenticado?', entao a rota mostra tela neutra em vez de chutar que nao —
chutar faz o login piscar para quem esta autenticado, com rede lenta.

Sair encerra a sessao localmente mesmo se a chamada ao servidor falhar:
deixar o usuario preso numa sessao que ele pediu para encerrar e pior.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Playwright contra o gateway real, e documentação

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/auth.spec.ts`, `.env.example`
- Modify: `README.md`
- Create: `docs/superpowers/follow-ups-fatia-3a.md`

**Interfaces:**
- Consumes: a aplicação inteira, servida pelo Vite.
- Produces: nada de produção.

- [ ] **Step 1: Configurar o Playwright**

`playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
```

`.env.example`:

```
VITE_API_URL=http://localhost:8000/api/v1
```

- [ ] **Step 2: Escrever os testes de ponta a ponta**

`tests/e2e/auth.spec.ts`:

```ts
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

  await expect(page.getByText("Início")).toBeVisible();
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
  await expect(page.getByText("Início")).toBeVisible();

  await page.reload();

  // O access token vive so em memoria e se perdeu no recarregamento. Voltar
  // autenticado prova que o cookie httpOnly e o boot silencioso funcionam
  // contra o gateway de verdade.
  await expect(page.getByText("Início")).toBeVisible();
  await expect(page.getByText("Entrar na sua conta")).toHaveCount(0);
});
```

- [ ] **Step 3: Rodar os testes de ponta a ponta**

Com o Postgres e o gateway no ar:

```bash
npm run e2e
```

Expected: os três passam. Se `registrar` falhar com `DOCUMENT_ALREADY_REGISTERED`, os dois CPFs do arquivo já foram usados no banco local — troque por outro CPF válido ou limpe a tabela `users`.

- [ ] **Step 4: Escrever o README**

Substituir `README.md` inteiro por:

````markdown
# nexuspay-web-client

Cliente web do NexusPay. React 19 com Vite, Tailwind 4 e shadcn/ui, em dois
idiomas (PT-BR e EN). Consome o gateway FastAPI.

## Rodar

Pré-requisito: o gateway no ar em `http://localhost:8000`.

```bash
npm install
cp .env.example .env
npm run dev
```

> A porta **5173 é obrigatória** e está fixada com `strictPort`. O CORS do
> gateway libera exatamente `http://localhost:5173` e recusa curinga. Se a
> porta estiver ocupada, o Vite falha em vez de escorregar para 5174 — o que
> pareceria funcionar até toda requisição morrer por CORS.

## Testes

```bash
npm test        # Vitest + MSW, roda sozinho
npm run e2e     # Playwright contra o gateway real
```

O Playwright exige o gateway e o Postgres no ar. É ele que pega contrato
quebrado; os testes com MSW continuam verdes quando o servidor muda.

## Como a sessão funciona

O access token dura 15 minutos e vive **só em memória**. O refresh token é um
cookie `httpOnly` que o JavaScript não alcança.

Ao carregar, o app tenta um refresh silencioso antes de decidir entre login e
aplicação — por isso existe uma tela de carga curta em vez de a tela de login
aparecer e sumir.

**A renovação é em fila única.** O gateway rotaciona o refresh token e revoga
todas as sessões se receber um token já usado. Duas requisições que tomam 401
ao mesmo tempo precisam compartilhar uma única chamada a `/auth/refresh` —
`src/lib/http.ts` cuida disso, e `src/lib/http.test.ts` prova.

## Erros

Traduzidos por `error.code`, nunca por `error.message`. O catálogo vive em
`src/lib/errors.ts` e é **mantido à mão**: um teste garante que todo código
tem tradução nos dois idiomas, mas ninguém garante que a lista acompanhe um
código novo no gateway. Ao ver `codigo de erro desconhecido` no console, é
isso.
````

- [ ] **Step 5: Escrever os follow-ups**

`docs/superpowers/follow-ups-fatia-3a.md`:

```markdown
# Follow-ups da Fatia 3a

## Precisa sair antes da Fatia 4 (deploy)

### `VITE_API_URL` e a origem do CORS estão presas ao desenvolvimento

O cliente aponta para `http://localhost:8000` e o gateway libera
`http://localhost:5173`. No deploy os dois viram outra coisa, e o
`strictPort` deixa de fazer sentido. Ajustar junto com a configuração de
deploy, dos dois lados.

## Dívida conhecida

### O catálogo de erro não se atualiza sozinho

`CODIGOS_DE_ERRO` em `src/lib/errors.ts` é mantido à mão. O teste pega
tradução faltando, não código novo no gateway. Um contrato executável entre
os repositórios — gerar a lista a partir do OpenAPI, por exemplo — resolveria,
mas os códigos não estão no schema hoje.

### Sem tema escuro

O shadcn já instala as variáveis; falta o alternador e a preferência
persistida. Não é requisito desta fatia.

## Fora de escopo, mas alguém vai perguntar

- **Recuperação de senha.** Não existe rota no gateway.
- **Lembrar-me / sessão longa.** O refresh dura 7 dias e é o que há.
```

- [ ] **Step 6: Rodar a suíte inteira uma última vez**

```bash
npm test
npm run build
```

Expected: testes verdes e build sem erro de tipo.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: ponta a ponta contra o gateway real, README e follow-ups

Os testes de Playwright sao os que pegam contrato quebrado. Um deles recarrega
a pagina depois de registrar: o access token vive so em memoria, entao voltar
autenticado prova o cookie httpOnly e o boot silencioso contra o gateway de
verdade.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verificação final da fatia

Os critérios de aceitação do spec §13, e onde cada um é coberto:

| # | Critério | Coberto por |
|---|---|---|
| 1 | Registro entra direto | Task 7, `registrar autentica direto`; Task 9 ponta a ponta |
| 2 | Credencial errada, mensagem traduzida | Task 7; Task 9 ponta a ponta |
| 3 | `429` tem mensagem própria | Task 7, `limite de tentativas tem mensagem propria` |
| 4 | Token expirado renova e repete | Task 5, `renova e repete quando o token expirou` |
| 5 | **Concorrentes disparam um único refresh** | Task 5, `VARIAS requisicoes concorrentes disparam UM UNICO refresh` — com mutação obrigatória no Step 6 |
| 6 | `REFRESH_TOKEN_REUSED` desloga com mensagem própria | Task 5 (encerra a sessão) + Task 3 (a mensagem) |
| 7 | Recarregar não pisca o login | Task 8, `em booting mostra tela neutra`; Task 9 ponta a ponta |
| 8 | Sem sessão vai ao login | Task 8, `sem sessao leva ao login` |
| 9 | Trocar idioma troca o texto e persiste | Task 8 (troca) + Task 2 (persistência via `localStorage`) |
| 10 | Os 27 códigos traduzidos nos dois idiomas | Task 3, com mutação obrigatória no Step 6 |
| 11 | Sair revoga e volta ao login | Task 8, `sair revoga a sessao e volta ao login` |

**Cobertura parcial declarada no critério 9.** A troca de idioma é testada; a *persistência* dela depende do `localStorage` configurado na Task 2 e não tem teste que recarregue a página e confirme o idioma mantido. O teste de ponta a ponta poderia fechar isso. Se não for feito, registre em `follow-ups-fatia-3a.md` como cobertura ausente — **não** o declare coberto.
