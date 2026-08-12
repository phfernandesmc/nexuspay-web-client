# Fatia 3a — Fundação e identidade do cliente web

Projeto React que consome o gateway do NexusPay: cliente HTTP com renovação de sessão, internacionalização, telas de registro e login, e a casca autenticada que a Fatia 3b vai preencher.

Repositório: `nexuspay-web-client`.

---

## 1. O que as fatias anteriores deixam pronto

O gateway está mesclado em `main` com 193 testes passando, e a API é estável.

**Autenticação:**

| Rota | Efeito |
|---|---|
| `POST /api/v1/auth/register` | Cria o usuário, **devolve token e seta o cookie** — registrar já entra |
| `POST /api/v1/auth/login` | `5/minute` por IP |
| `POST /api/v1/auth/refresh` | Rotaciona o refresh token e devolve um access token novo |
| `POST /api/v1/auth/logout` | Revoga a sessão |
| `GET /api/v1/auth/me` | Dados do usuário autenticado |

**O refresh token viaja em cookie `httpOnly`**, nunca no corpo. O JavaScript não o alcança — e não deve tentar. O access token dura **15 minutos**; o refresh, **7 dias**.

**Envelope de erro**, uniforme em toda a API:

```json
{ "error": { "code": "INSUFFICIENT_FUNDS", "message": "...", "details": {} } }
```

**CORS** já libera `http://localhost:5173` com credenciais, e o validador do gateway recusa `*` nessa configuração. O Vite precisa ficar na porta 5173.

## 2. Escopo

**Dentro:** projeto e ferramental, i18n EN/PT-BR, cliente HTTP com renovação em fila única, store de sessão, telas de registro e login, logout, guarda de rota, casca autenticada com barra lateral, tradução de erro por código, e a suíte de testes.

**Fora, e vai para a 3b:** contas, contatos, transferência, depósito, extrato, estado `PENDING` das transações, `Idempotency-Key`. Deploy é a Fatia 4.

A tela de Início existe nesta fatia apenas para confirmar quem está autenticado. Ela não mostra saldo — o saldo é dinheiro, e dinheiro é 3b.

## 3. Stack e versões

Todas verificadas no registro do npm, não escritas de memória.

| Pacote | Versão | Observação |
|---|---|---|
| `react` / `react-dom` | 19.2.8 | |
| `vite` | 8.2.1 | porta **5173**, exigida pelo CORS do gateway |
| `typescript` | 7.0.2 | |
| `tailwindcss` + `@tailwindcss/vite` | 4.3.3 | v4 é **configuração em CSS**; não existe `tailwind.config.js` por padrão |
| `shadcn` (CLI) | 4.17.0 | gera componentes dentro de `components/ui`, que passam a ser código nosso |
| `zustand` | 5.0.14 | |
| `axios` | 1.19.0 | |
| `react-router` | 8.3.0 | |
| `i18next` / `react-i18next` | 26.3.6 / 17.0.11 | com `i18next-browser-languagedetector` 8.2.1 |
| `react-hook-form` + `zod` + `@hookform/resolvers` | 7.85.0 / 4.4.3 / 5.7.1 | validação de formulário |
| `vitest` + `@testing-library/react` + `jsdom` | 4.1.10 / 16.3.2 / 30.0.1 | |
| `msw` | 2.15.0 | |
| `@playwright/test` | 1.62.1 | |

**TanStack Query fica de fora desta fatia.** O único estado de servidor aqui é `/auth/me`. A decisão volta na 3b, onde vivem extrato paginado e o acompanhamento de transações `PENDING`.

## 4. Estrutura de arquivos

Organizada por funcionalidade, não por tipo: o que muda junto fica junto.

```
src/
  main.tsx
  app/router.tsx           rotas e guarda de autenticação
  app/i18n.ts              configuração do i18next
  lib/http.ts              instância Axios e interceptores
  lib/errors.ts            tradução de erro por código
  components/ui/           gerado pelo shadcn
  components/layout/       AppShell, Sidebar, Topbar, LanguageSwitch
  features/auth/
    api.ts                 register, login, refresh, logout, me
    session.store.ts       Zustand
    useSessionBootstrap.ts refresh silencioso na carga
    LoginPage.tsx
    RegisterPage.tsx
  pages/HomePage.tsx       mínima; a 3b preenche
  locales/en.json
  locales/pt-BR.json
tests/
  e2e/                     Playwright contra o gateway real
```

## 5. O cliente HTTP — o núcleo desta fatia

`lib/http.ts` existe para resolver um problema específico, e o desenho inteiro se subordina a ele.

**O problema.** O gateway rotaciona o refresh token a cada uso e detecta reuso: apresentar um token já rotacionado devolve `REFRESH_TOKEN_REUSED` e **revoga todas as sessões do usuário**. Isso é proteção correta contra roubo de token. Mas significa que duas chamadas `/auth/refresh` concorrentes, disparadas pelo próprio cliente, derrubam a sessão — e duas requisições em paralelo tomando `401` ao mesmo tempo é o caso **normal** de qualquer tela que carregue mais de um recurso.

**A solução: renovação em fila única.** Uma promessa em escopo de módulo:

- a primeira resposta `401` com código `TOKEN_EXPIRED` dispara `/auth/refresh` e guarda a promessa;
- toda outra `401` no mesmo intervalo **aguarda a mesma promessa**, sem disparar a sua;
- quando resolve, cada requisição em espera é repetida **uma única vez**;
- quando falha, todas falham e a sessão é limpa.

Três detalhes fazem parte do mesmo mecanismo:

1. **`/auth/refresh` é isenta do interceptor.** Sem isso, um refresh que devolve 401 tenta se renovar sozinho, em recursão.
2. **Cada requisição carrega uma marca de já-repetida.** Sem isso, uma requisição que continue falhando com 401 depois da renovação entra em laço infinito.
3. **`REFRESH_TOKEN_REUSED` é logout imediato com mensagem própria.** O usuário precisa saber que as sessões foram revogadas por segurança; tratá-lo como "faça login de novo" esconde um evento que pode ser roubo de token.

`withCredentials: true` é obrigatório em toda a instância: sem ele o cookie de refresh não viaja e nada funciona.

## 6. Store de sessão e o boot

```ts
{ accessToken: string | null, user: User | null, status: 'booting' | 'authenticated' | 'anonymous' }
```

O access token vive **só em memória**. Recarregar a página o perde — e isso é aceitável, porque o cookie `httpOnly` sobrevive e restaura a sessão. Guardá-lo em `localStorage` o exporia a qualquer XSS sem ganhar nada que o cookie já não dê.

**O boot** é a razão de o `status` ter três valores em vez de um booleano. Ao carregar, o app chama `/auth/refresh` uma vez: `200` guarda o token e busca `/auth/me`; `401` significa anônimo. Enquanto isso o `status` é `booting` e a tela é neutra — **nunca a de login**.

Mostrar a tela de login por um instante para quem está autenticado é o defeito clássico desta arquitetura. Ele não aparece em desenvolvimento, onde a rede é instantânea; aparece no primeiro usuário com conexão ruim.

## 7. Telas

| Rota | Conteúdo | Erros que precisa tratar |
|---|---|---|
| `/login` | email, senha | `INVALID_CREDENTIALS` (401), `RATE_LIMIT_EXCEEDED` (429) |
| `/register` | nome, email, CPF, senha | `EMAIL_ALREADY_REGISTERED`, `DOCUMENT_ALREADY_REGISTERED` (409), `INVALID_DOCUMENT`, `WEAK_PASSWORD`, `VALIDATION_ERROR` (422) |
| `/` (protegida) | `AppShell` + Início mínima | — |

Registrar autentica direto, sem passar pelo login: a rota já devolve token e seta o cookie.

**O `429` merece tratamento próprio.** O limite de `5/minute` no login é atingido por quem simplesmente errou a senha algumas vezes — o caso mais comum de todos. Cair na mensagem genérica ali seria péssimo justamente com o usuário já frustrado.

**A casca** é barra lateral fixa à esquerda, colapsando para gaveta no celular, com o seletor de idioma e o botão de sair no topo. A 3b acrescenta itens de navegação sem redesenho.

## 8. Tradução de erro por código

`lib/errors.ts` traduz **por `error.code`**, nunca por `error.message`. Mensagem é texto do servidor: muda sem aviso, não tem idioma, e não é contrato.

- Um mapa de código para chave de tradução.
- Código desconhecido cai numa mensagem genérica **e vai para o console** — a divergência precisa aparecer, não virar um texto vago.
- `VALIDATION_ERROR` traz `details.fields[]`, cada item com `field` e `reason`, mapeados de volta para os campos do formulário.

**O catálogo do gateway hoje são 27 códigos**, e todos precisam de tradução mesmo que esta fatia só exercite os de autenticação e validação — o mapa é compartilhado com a 3b.

Vinte e quatro vêm das classes de erro de aplicação:

`INVALID_CREDENTIALS`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `REFRESH_TOKEN_REUSED`, `EMAIL_ALREADY_REGISTERED`, `DOCUMENT_ALREADY_REGISTERED`, `INVALID_DOCUMENT`, `WEAK_PASSWORD`, `ACCOUNT_NOT_FOUND`, `ACCOUNT_HAS_BALANCE`, `ACCOUNT_HAS_PENDING_TRANSACTIONS`, `ACCOUNT_LIMIT_REACHED`, `ACCOUNT_ALREADY_CLOSED`, `ACCOUNT_NUMBER_GENERATION_FAILED`, `INSTITUTION_NOT_FOUND`, `CONTACT_NOT_FOUND`, `CONTACT_OWN_ACCOUNT`, `CONTACT_ALREADY_EXISTS`, `RATE_LIMIT_EXCEEDED`, `VALIDATION_ERROR`, `TRANSACTION_NOT_FOUND`, `INSUFFICIENT_FUNDS`, `SAME_ACCOUNT_TRANSFER`, `IDEMPOTENCY_KEY_REUSED`.

**Outros três não vêm dessas classes e são fáceis de esquecer**, porque nascem nos manipuladores genéricos do gateway e não num `raise` explícito: `NOT_FOUND` (rota inexistente), `METHOD_NOT_ALLOWED` e `INTERNAL_ERROR` (qualquer exceção não tratada). Um cliente que só mapeie o catálogo de aplicação mostra mensagem genérica justamente quando algo quebrou de verdade.

Há ainda uma família dinâmica, `HTTP_<status>`, que o gateway emite para status HTTP sem código próprio. Ela **não** é enumerável, e é o caso legítimo da mensagem genérica.

Um teste percorre a lista dos 27 e falha se algum não tiver tradução **nos dois idiomas**. É o equivalente frontend do `SchemaDriftTest` do worker.

**Limite honesto desse teste:** a lista é mantida à mão neste repositório. Ele pega tradução faltando, mas **não** pega código novo adicionado ao gateway depois — para isso alguém precisa atualizar a lista. É a mesma fragilidade que o dump de schema tem no worker, e pela mesma razão: são dois repositórios sem contrato executável entre eles.

## 9. Internacionalização

i18next com detecção pelo navegador e **PT-BR como fallback** — o domínio é brasileiro, com CPF, agência e conta. O idioma escolhido persiste em `localStorage`, que é preferência e não segredo.

Chaves em três espaços: `common`, `auth`, `errors`.

**Regra dura: nenhuma string literal dentro de componente.** É o que impede o segundo idioma de virar dívida já no primeiro dia — e é verificável, diferente de "lembrar de traduzir".

## 10. Testes

**O teste mais importante desta fatia é um só:** disparar várias requisições concorrentes que tomam `401` e assegurar que `/auth/refresh` foi chamado **exatamente uma vez**, e que todas as requisições foram repetidas depois. Ele é o único que prova a fila única. Sem ele, o defeito aparece em produção como perda de sessão aparentemente aleatória, que é das coisas mais difíceis de diagnosticar por relato de usuário.

**Vitest com MSW** cobre o resto: telas de login e registro, o store, o boot, a tradução de erro e a completude do catálogo.

**Playwright contra o gateway real**, três caminhos:

1. registro até sessão viva
2. credencial errada devolve a mensagem certa
3. um refresh de verdade, com token realmente expirado

Para o terceiro, o gateway de teste sobe com `ACCESS_TOKEN_EXPIRE_MINUTES` reduzido, em vez de esperar quinze minutos.

MSW dá velocidade; o Playwright é o que pega contrato quebrado. Na Fatia 1 deste projeto, nove testes com dublês passavam enquanto o recurso principal estava inteiramente quebrado em produção — os dublês não conseguiam, por construção, reproduzir o defeito.

## 11. Configuração

| Variável | Valor local | Observação |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000/api/v1` | |

Nenhum segredo no cliente. Tudo que o frontend recebe é público por definição — a única credencial em jogo é o access token, que vem do servidor e vive em memória.

## 12. Riscos aceitos

1. **Recarregar a página custa um round-trip.** É o preço de não persistir o access token, e é o lado certo do trade-off.
2. **Playwright depende do gateway e do Docker no ar.** A suíte de Vitest roda sozinha; a de Playwright é um comando separado.
3. **shadcn gera código que passa a ser nosso.** Atualizar a biblioteca não atualiza o que já foi gerado. É o modelo dela, e é deliberado.

## 13. Critérios de aceitação

1. Registro cria o usuário e entra direto, sem passar pelo login.
2. Login com credencial errada mostra a mensagem de credencial inválida, traduzida.
3. Sexta tentativa de login em um minuto mostra mensagem própria de limite, não a genérica.
4. Com o access token expirado, uma requisição é renovada e repetida sem o usuário perceber.
5. **Várias requisições concorrentes com token expirado disparam `/auth/refresh` uma única vez**, e todas são repetidas.
6. `REFRESH_TOKEN_REUSED` desloga com mensagem própria sobre revogação de sessões.
7. Recarregar a página em sessão válida volta autenticado, **sem piscar a tela de login**.
8. Recarregar sem sessão leva ao login.
9. Trocar o idioma troca todo o texto visível, e a escolha sobrevive ao recarregamento.
10. Os 27 códigos do catálogo do gateway têm tradução nos dois idiomas, incluindo `NOT_FOUND`, `METHOD_NOT_ALLOWED` e `INTERNAL_ERROR`.
11. Sair revoga a sessão no servidor e volta para o login.

## 14. Ponte para a Fatia 3b

O que fica pronto: cliente HTTP que renova sozinho, sessão, i18n, tradução de erro para o catálogo **inteiro**, e a casca com navegação.

O que a 3b precisa decidir e este spec deliberadamente não decide:

- se entra TanStack Query para o estado de servidor
- como a interface acompanha uma transação `PENDING` até o worker resolvê-la: polling, atualização manual, ou nada
- onde a `Idempotency-Key` é gerada e por quanto tempo é reaproveitada numa nova tentativa
- como o extrato paginado por cursor se comporta ao carregar mais
