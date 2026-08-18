# Follow-ups da Fatia 3c

## Não existe caminho na interface para transferir entre contas do próprio usuário

Descoberto ao tentar escrever o e2e de transferência da onda de reparos da
review final: `POST /contacts/lookup` recusa qualquer conta que pertença ao
próprio requisitante (`app/domains/contact/service.py:44-45` no repositório
do gateway), não só a conta de origem escolhida na tela. Como esse é o
único endpoint que a `TransferPage` usa para achar um destino que não está
salvo como contato (e o mesmo endpoint, reusado, bloqueia salvá-la como
contato também — `AddContactDialog` reproduz o mesmo erro), não há hoje
NENHUM caminho de UI para um usuário transferir entre duas contas próprias.

O domínio contradiz essa limitação: o gateway expõe
`is_between_own_accounts`, e o extrato da Fatia 3b já exibe esse caso como
"Entre suas contas" (`statement:ownTransfer`). O modelo espera que a
transação exista; a interface não tem como criá-la.

Resolver exige uma decisão de produto que mexe no gateway (outro
repositório, outra fatia): ou um endpoint de busca que aceite conta
própria do requisitante, ou um seletor de "minhas contas" no formulário de
transferência que dispense o lookup por instituição/agência/número.

## O e2e de transferência não é executável nesta fatia: exige o worker, e o worker é perigoso de subir localmente

A `TransferPage` desabilita o botão de envio só quando os campos estão
incompletos — quem decide se o saldo é suficiente é sempre o servidor. Isso
significa que um e2e de transferência de ponta a ponta precisa de saldo
REAL na conta de origem, e saldo só fica real depois que o depósito sai de
`PENDING` para `COMPLETED` — o que só o worker faz.

Subir o worker localmente para isso foi considerado e descartado: o
`application.yml` dele aponta para `api-processar-transferencia-worker.fifo`,
a MESMA fila compartilhada com produção que já consta no follow-up acima.
Publicar nela (o que os testes de depósito já fazem) é comparativamente
inofensivo — uma mensagem nossa chegando a um worker de produção referencia
uma transação que não existe lá, falha e vai para a DLQ. **Consumir é outra
coisa**: um worker local ligado nessa fila passaria a puxar mensagens dela,
inclusive as publicadas pelo gateway de produção, tentaria processá-las
contra o banco de desenvolvimento, não acharia a transação, e a mensagem
seria descartada ou mandada para a DLQ — ou seja, engolir um pagamento real
de alguém. O risco de "um teste sem cobertura" é preferível ao risco de
"destruir um pagamento em produção", então o worker fica desligado e o
teste não foi escrito.

O que FOI provado, rodando de verdade contra o gateway em
`http://localhost:8000` (sem o worker): o desenho com **dois usuários** —
registrar A, abrir conta e depositar, sair, registrar B, abrir conta, sair,
entrar de novo como A, buscar a conta de B por instituição/agência/número —
passa por registro, login, logout e pelo `POST /contacts/lookup` sem
esbarrar em `CONTACT_OWN_ACCOUNT`, encontrando corretamente o titular da
conta de B. O caminho só emperra no envio final da transferência, com
`Saldo disponível insuficiente` — porque o depósito de A nunca saiu de
`PENDING`. Para quem retomar: o caminho de UI está validado até o ponto do
saldo; falta só a fonte de saldo real.

Fechar isto exige uma fila de desenvolvimento separada da de produção — que
é assunto da Fatia 4, junto com a separação já registrada no follow-up "O
e2e desta fatia publica na fila SQS compartilhada".

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

## O teste de paginação real do extrato ainda não foi escrito

Herdado da 3b (`docs/superpowers/follow-ups-fatia-3b.md`), item "O e2e não
exercita paginação real do extrato". A 3c removeu o bloqueio que impedia
escrevê-lo — `tests/e2e/dinheiro.spec.ts` agora gera uma transação de
verdade via o fluxo real da UI, então o extrato passou a ter dado real para
paginar — mas o teste em si, que navega até o extrato e clica "Carregar
mais" contra uma segunda página de verdade, não foi escrito nesta fatia.
Falta gerar transações suficientes (mais de uma página) para uma única
conta e exercitar o botão contra o gateway real.
