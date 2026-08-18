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

## Estado do servidor

Dados que vêm do gateway (contas, extrato, instituições) vivem no **TanStack
Query**; a sessão (token de acesso, usuário logado) vive no **Zustand**
(`src/features/auth/session.store.ts`). Nada é copiado de um para o outro —
misturar os dois é como um dado de servidor acaba desatualizado sem que
nenhum teste perceba.

`refetchOnWindowFocus` está **desligado de propósito** em
`src/app/queryClient.ts`: nada busca sozinho, nem por timer nem ao voltar
para a aba. Os dados ainda renovam ao navegar, porque a consulta remonta e
busca de novo se estiver velha (`staleTime` padrão zero).

As chaves de cache das contas ficam todas em um lugar só,
`src/features/account/queries.ts` (objeto `CHAVES`). A invalidação depende
delas casarem exatamente — uma chave escrita à mão fora dali não invalida
nada, e o sintoma é um saldo velho que só some ao recarregar a página.

Transferência e depósito exigem o cabeçalho `Idempotency-Key`. A chave é
gerada por intenção — muda quando muda a conta de origem, o destino ou o
valor — e presa ao payload que ela representa; ela **não é persistida**, e
por isso morre junto com o formulário. O comprovante em `/transacoes/:id` é
quem responde "passou?" depois de um recarregamento: ele busca a transação
de novo pelo id, não depende de nenhum estado de navegação, e é o único
lugar em que a resposta continua confiável se a chave de idempotência já
tiver sumido.

## Erros

Traduzidos por `error.code`, nunca por `error.message`. O catálogo vive em
`src/lib/errors.ts` e é **mantido à mão**: um teste garante que todo código
tem tradução nos dois idiomas, mas ninguém garante que a lista acompanhe um
código novo no gateway. Ao ver `codigo de erro desconhecido` no console, é
isso.
