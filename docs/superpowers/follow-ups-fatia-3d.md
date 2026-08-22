# Follow-ups da Fatia 3d

## O `pending_outgoing` é um retrato do instante da consulta

Entre ler o campo e enviar a transferência, outra aba pode criar uma
pendência. O servidor continua sendo a autoridade sobre fundos, e o erro
`INSUFFICIENT_FUNDS` continua traduzido — mas o aviso não-bloqueante da tela
pode não aparecer quando deveria. É o mesmo desenho de antes, com um número
exato no lugar de um estimado.

## Transferir para conta própria não tem passo de confirmação

Escolher a conta errada na lista move dinheiro entre contas suas. É
recuperável por uma transferência inversa, ao contrário de mandar para um
estranho — foi por isso que a confirmação de titular ficou só no caminho da
busca. Se aparecer relato de engano, o passo pode ser acrescentado.

## O e2e de transferência continua bloqueado

Herdado da Fatia 3c e **não fechado aqui**: o teste ponta a ponta precisa do
worker para o depósito sair de `PENDING` e a conta de origem ter saldo real,
e o worker consome da fila SQS compartilhada com produção. Fechar isso exige
uma fila separada para desenvolvimento, que é assunto da Fatia 4.

## A escala do `pending_outgoing` não tem constante compartilhada entre as rotas — de propósito

No repositório do gateway, `TransactionRepository` normaliza a escala de
`pending_outgoing` na fonte (`_MONEY_SCALE = Decimal("0.01")`, usado em
`sum_pending_outgoing` e `sum_pending_outgoing_by_accounts`), porque
`COALESCE(SUM(...), 0)` devolve o literal `0` com escala zero quando não há
linha nenhuma. A rota de abrir conta (`app/domains/account/router.py`) não
passa por nenhuma dessas duas consultas — uma conta recém-aberta não tem
transação nenhuma, então o pendente é zero por construção, e uma consulta só
para descobrir isso seria desperdício. Ela escreve `Decimal("0.00")` como
literal solto, sem importar a constante do repositório.

Isso não foi esquecimento: os dois lugares não podem divergir em silêncio
porque `tests/integration/test_account_router.py` tem
`test_pending_outgoing_tem_a_mesma_escala_nos_quatro_caminhos`, que compara
a *string* crua do JSON — não `Decimal` contra `Decimal`, que trataria
`"0"` e `"0.00"` como iguais — entre abrir conta, listar, detalhe e
renomear. Se algum dia alguém "consertar" a duplicação criando uma
constante compartilhada entre o router e o repository, tudo bem — mas o
teste de string tem que continuar existindo depois. Ele é a proteção real
contra a escala dos quatro caminhos divergirem de novo; a duplicação do
literal era só o sintoma que o motivou.
