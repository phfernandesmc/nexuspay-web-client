# Fatia 3d — Transferência entre contas próprias e o disponível correto

Duas mudanças que se encontram na tela de transferência: permitir mover dinheiro entre as contas do próprio usuário, e substituir o disponível estimado por um número exato vindo do gateway.

Repositórios: `nexuspay-web-client` e `nexuspay-api-gateway`.

---

## 1. Por que esta fatia existe

A Fatia 3c registrou dois follow-ups que esta fatia fecha.

O primeiro foi descoberto ao tentar escrever o teste ponta a ponta da transferência: **não existe caminho na interface para mover dinheiro entre duas contas do mesmo usuário**, porque a única forma de descobrir um destino é o `POST /contacts/lookup`, que recusa qualquer conta do requisitante.

O segundo vem da Fatia 3b: o saldo **disponível** é derivado no cliente lendo as 100 primeiras transações do extrato, e a §6 daquele spec declara o furo — quando há mais de 100 transações depois de uma pendência antiga, o número exibido fica **maior** que o real, exatamente na situação em que ele mais importa.

## 2. O que o código já permite, verificado e não presumido

Três fatos lidos do código em execução, não da memória:

1. **A transferência entre contas próprias já é permitida pelo gateway.** Em `app/domains/transaction/service.py`, a origem é validada como do usuário via `_own_account_or_404`, mas o destino passa apenas por `get_by_id` com checagem de `None` e `CLOSED` — **não há checagem de dono**. A única recusa é `source_account_id == destination_account_id`, que levanta `SAME_ACCOUNT_TRANSFER`.

2. **A soma de saídas pendentes já é calculada no gateway.** O `sum_pending_outgoing(account_id)` existe em `app/domains/transaction/repository.py` e já é usado na validação de fundos da transferência.

3. **O domínio já espera transferência entre contas próprias.** O `TransactionOut` expõe `is_between_own_accounts`, e o extrato da Fatia 3b já o exibe como "Entre suas contas" — a interface está pronta para uma transação que ela não conseguia criar.

A consequência prática é que a mudança (1) desta fatia **não toca o gateway**: é falta de descoberta na interface, não regra de negócio.

## 3. Escopo

**Dentro:** o destino de conta própria no formulário de transferência; o campo novo no `AccountOut`; o disponível calculado a partir dele; e a remoção do cálculo derivado que a Fatia 3b introduziu.

**Fora:** deploy, que é a Fatia 4, e continua carregando a separação da fila SQS de desenvolvimento.

## 4. Decisões tomadas antes do desenho

Três, todas do dono do projeto:

1. **A conta própria é uma terceira opção no mesmo seletor de destino**, não uma tela separada nem uma escolha prévia de tipo.
2. **O gateway expõe a soma crua, não o disponível calculado.** Quem subtrai é o frontend.
3. **Esta fatia vem antes da Fatia 4**, porque mexer no `AccountOut` depois do deploy é mais caro.

## 5. Transferência entre contas próprias

Rota `/transferir`, sem tela nova.

O seletor de destino passa a listar **dois grupos**: as suas outras contas ativas e os seus contatos salvos. As contas próprias aparecem por apelido, instituição e número — os mesmos dados que a lista de contas já mostra.

**Não há passo de confirmação de titular** para conta própria, e a ausência é deliberada: o passo existe para o usuário ler o nome de quem vai receber antes de mandar dinheiro para um estranho. Numa conta sua não há nome a conferir.

**A conta escolhida como origem some da lista de destinos.** Isso elimina por construção o erro de mandar para a mesma conta, em vez de deixá-lo acontecer e traduzir a recusa. O `SAME_ACCOUNT_TRANSFER` continua tratado, porque o servidor ainda pode recebê-lo por outro caminho — dois formulários abertos, por exemplo.

O resto do fluxo não muda: mesma chave de idempotência presa ao payload, mesmo comprovante, mesma invalidação de cache das duas contas envolvidas.

## 6. O disponível vindo do gateway

**No gateway.** O `AccountOut` ganha `pending_outgoing`, um `Decimal` com a soma das saídas `PENDING` daquela conta. O nome descreve o que o campo é — a soma crua —, não o que o consumidor faz com ele.

Na listagem, a soma vem de **uma consulta agrupada por conta**, não de uma consulta por conta. O gateway limita 10 contas ativas por usuário, então o custo seria pequeno de qualquer forma, mas uma query só é a forma correta e não degrada se o limite mudar.

**Entrada pendente não entra na soma.** Um depósito `PENDING` não reduz o que você pode gastar — o dinheiro está chegando, não saindo. Isso já é o comportamento do `sum_pending_outgoing`, e o teste precisa fixá-lo.

**No frontend.** O disponível passa a ser `balance − pending_outgoing`, calculado em centavos inteiros como todo dinheiro do projeto. Ele aparece **em cada cartão da lista de contas**, não só no detalhe. O cartão passa a mostrar **os dois números**: o saldo, que é o que a conta tem, e o disponível, que é o que dá para gastar. Mostrar só o saldo é o que engana hoje quando há dinheiro a caminho; mostrar só o disponível esconderia dinheiro que é do usuário.

## 7. O que sai do código

A substituição apaga mais do que acrescenta, e isso é o ponto:

- o hook `usePendentesDeSaida`, com sua consulta `limit=100` ao extrato
- o `PendingBalanceLine` como consulta separada, com seus estados de carregamento e de erro
- **o furo declarado na §6 do spec da Fatia 3b**

O componente da linha de processamento **continua existindo** na tela do detalhe, com o mesmo texto e o mesmo lugar. O que muda é de onde ele tira o número: em vez de uma consulta própria ao extrato, ele recebe o `pending_outgoing` que já veio junto com a conta. Ele deixa de ter estados de carregamento e de erro porque deixa de ter consulta. O aviso não-bloqueante da transferência continua existindo e passa a comparar contra um número exato.

## 8. Erros

Nenhum código novo. `SAME_ACCOUNT_TRANSFER`, `INSUFFICIENT_FUNDS`, `ACCOUNT_NOT_FOUND` e `IDEMPOTENCY_KEY_REUSED` já estão no catálogo e continuam traduzidos por código, nunca pela mensagem do servidor.

A falha de carregar as contas continua bloqueando a tela com alerta traduzido, como a Fatia 3c estabeleceu — e agora ela cobre também o disponível, que deixou de ter consulta própria para falhar sozinha.

## 9. Testes

**No gateway:** que `pending_outgoing` soma apenas saídas `PENDING` da conta; que uma entrada `PENDING` **não** o afeta; que uma saída `COMPLETED` não o afeta; e que a consulta agrupada da listagem devolve o mesmo que a individual do detalhe.

**No frontend:** que a conta de origem não aparece entre os destinos; que transferir para conta própria manda o `account_id` correto **sem passar pelo `lookup`**; que o disponível exibido é `balance − pending_outgoing`, com valores que quebram em ponto flutuante; e que a lista de contas mostra o disponível em cada cartão.

**Um teste que existe para pegar defeito silencioso:** trocar `pending_outgoing` por zero no mock deve mudar o disponível na tela. Um teste que só verificasse "aparece um número" passaria com o saldo cheio.

**Ponta a ponta continua bloqueado pelo worker**, como na Fatia 3c: sem ele o depósito não sai de `PENDING`, a conta de origem não tem saldo real, e a transferência falha por fundos. O bloqueio está registrado em `docs/superpowers/follow-ups-fatia-3c.md` e não é reaberto aqui.

## 10. Riscos aceitos

1. **O `pending_outgoing` é um retrato do instante da consulta.** Entre lê-lo e enviar, outra aba pode criar uma pendência. O servidor continua sendo a autoridade sobre fundos — é o mesmo desenho de hoje, com um número honesto no lugar de um estimado.
2. **A mudança no `AccountOut` é um contrato compartilhado.** O frontend é o único consumidor hoje, e o worker não lê esse schema, mas qualquer cliente futuro precisa do campo novo.
3. **Transferir para a própria conta não tem passo de confirmação.** Um clique na conta errada da lista move dinheiro entre contas suas — recuperável por uma transferência inversa, ao contrário de mandar para um estranho.

## 11. Critérios de aceitação

1. O seletor de destino lista as contas próprias e os contatos salvos em grupos distintos.
2. A conta escolhida como origem não aparece entre os destinos.
3. Transferir para uma conta própria cria a transação e leva ao comprovante, sem chamar o `lookup`.
4. Trocar a origem atualiza a lista de destinos, removendo a nova origem e devolvendo a anterior.
5. O `AccountOut` traz `pending_outgoing` na listagem e no detalhe.
6. `pending_outgoing` soma apenas saídas `PENDING`; entrada `PENDING` e saída `COMPLETED` não entram.
7. A consulta agrupada da listagem devolve o mesmo valor que a individual do detalhe.
8. Cada cartão da lista de contas mostra o saldo **e** o disponível, sendo o disponível igual a `balance − pending_outgoing`.
9. A soma com valores que quebram em ponto flutuante dá o total exato.
10. O detalhe da conta mostra a linha de processamento com o mesmo texto de hoje, sem fazer consulta própria ao extrato.
11. O hook `usePendentesDeSaida` e a consulta `limit=100` não existem mais no código.
12. A falha de carregar contas mostra alerta traduzido e não exibe disponível nenhum.

## 12. Ponte para a Fatia 4

O que fica pronto: o produto inteiro exercitável, com o disponível correto e sem o furo dos 100 itens.

O que a Fatia 4 decide e este spec deliberadamente não decide: onde cada peça roda, como as variáveis de ambiente chegam a cada uma, e **a separação da fila SQS de desenvolvimento da de produção** — que continua sendo o que impede o teste ponta a ponta de transferência e o que torna arriscado subir o worker localmente.
