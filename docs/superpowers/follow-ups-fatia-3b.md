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

### O ciclo completo de encerrar conta não tem teste encadeado

Critério de aceitação 6 do spec (§11): conta encerrada some da lista, e
continua acessível pelo detalhe com status encerrado. O que existe hoje
prova só metade — que encerrar chama o servidor e invalida as consultas
(`AccountDetailPage.test.tsx`, Task 6). Nenhum teste, unitário ou de ponta a
ponta, monta a lista, encerra, confirma que a conta some dali, navega para o
detalhe da mesma conta e confirma que ele responde com status `CLOSED` em
vez de "não encontrada". Fechar isso exige um teste que encadeie as duas
telas (`AccountsPage` → `AccountDetailPage`) ou um caminho no Playwright.
