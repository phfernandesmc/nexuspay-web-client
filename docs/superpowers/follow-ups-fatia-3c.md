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
