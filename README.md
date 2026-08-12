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
