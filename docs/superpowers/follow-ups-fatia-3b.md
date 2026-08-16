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

### O e2e não exercita paginação real do extrato — FECHADO na Fatia 3c

A §9 do spec pede dois caminhos no Playwright: abrir uma conta e vê-la na
lista, **e** "paginar o extrato de verdade". O primeiro existe
(`tests/e2e/contas.spec.ts`, "abrir uma conta e ve-la na lista"). O segundo
não existia: o teste que havia até então, "conta nova tem extrato vazio", só
provava o estado inicial sem transações — nunca gerava uma segunda página
nem exercitava "Carregar mais" contra o servidor real.

Gerar a transação necessária para isso exigia um depósito ou uma
transferência, e os dois eram da Fatia 3c — não existiam ainda nesta fatia.
Além disso, mesmo que existissem, alimentar o worker que processa essas
transações passa pela fila SQS `api-processar-transferencia-worker.fifo`,
que é compartilhada entre desenvolvimento e produção; um teste automatizado
não pode publicar nela só para gerar dados de fixture.

**Fechado na Fatia 3c**: `tests/e2e/dinheiro.spec.ts` criou o caminho de
depósito de ponta a ponta que faltava, gerando transações de verdade via o
fluxo real da UI contra o gateway real. Isso remove o bloqueio descrito
acima — a 3b não tinha como criar uma transação sem tocar numa fila que não
era dela, e agora existe. O teste de "Carregar mais" em si, clicando o botão
contra uma segunda página de verdade, não foi escrito nesta fatia; ele fica
como trabalho futuro trivial agora que a fonte da transação existe.

### O ciclo completo de encerrar conta agora tem teste encadeado

Antigo item desta lista, resolvido: critério de aceitação 6 do spec (§11)
— conta encerrada some da lista, e continua acessível pelo detalhe com
status encerrado. `AccountLifecycle.test.tsx` agora monta `AccountsPage` e
`AccountDetailPage` sob as mesmas rotas, encerra pela lista, confirma que a
conta some dali, e confirma que o detalhe, acessado direto pela URL depois,
responde com o status encerrado em vez de "não encontrada".
