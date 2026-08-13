# Fatia 3c — Contatos, transferência e depósito

As telas que movem dinheiro. Buscar e guardar contatos, transferir, depositar, e acompanhar uma transação que o servidor aceitou mas ainda não concluiu.

Repositório: `nexuspay-web-client`.

---

## 1. O que a Fatia 3b deixa pronto

A 3b está mesclada em `main`, com 120 testes de unidade e 5 ponta a ponta.

- **TanStack Query** como única fonte de estado de servidor, com o registro `CHAVES` centralizando as chaves de cache e a regra de invalidação escrita, não decidida caso a caso.
- **Dinheiro em centavos inteiros** — `paraCentavos`, `somarCentavos` e `formatarDinheiro`, sempre em `BRL`, com o separador do idioma ativo.
- **Contas e extrato** — a lista, o detalhe, o extrato paginado por cursor, e o saldo em processamento derivado.
- **Erro traduzido por código**, com os 29 códigos do gateway cobertos nos dois dicionários. A 3c não precisa acrescentar nenhum código de erro do gateway.
- **Playwright contra o gateway real**, com o `locale` fixado em `pt-BR` — sem isso o Chromium roda em inglês e nenhuma asserção em português bate.

## 2. Escopo

**Dentro:** contatos (buscar, salvar, favoritar, renomear, remover); transferência; depósito; e o recibo que serve as duas operações.

**Fora:** deploy, que é a Fatia 4.

## 3. O contrato do gateway, verificado e não presumido

Quatro fatos que mudam o desenho e que foram lidos do `openapi.json` do gateway em execução, não da memória:

1. **Transferência não conhece contato.** `TransferIn` pede `source_account_id`, `destination_account_id` e `amount`. O destino é um id de conta cru — contato é conveniência da interface, e o gateway não liga um ao outro.

2. **Salvar contato é obrigatoriamente dois passos.** `ContactCreate` exige `account_id`, e o único jeito de obtê-lo é `POST /contacts/lookup` com `institution_id`, `branch` e `number`. O lookup devolve `holder_name`, `type` e a instituição.

3. **O gateway distingue intenção nova de reenvio pelo status.** Transferência e depósito devolvem **202** quando criam a transação e **200** quando a `Idempotency-Key` já tinha sido usada. É o `_create_or_replay` da Fatia 2a.

4. **`failure_reason` é um conjunto fechado de códigos, não texto livre.** O enum do worker tem exatamente três valores — `INSUFFICIENT_FUNDS`, `SOURCE_ACCOUNT_UNAVAILABLE` e `DESTINATION_ACCOUNT_UNAVAILABLE` — e o comentário no código diz, com todas as letras, que existe assim para o frontend traduzir por código.

## 4. Decisões tomadas antes do desenho

Duas vinham da 3b e continuam valendo:

1. **A `Idempotency-Key` é gerada por intenção**, presa ao payload que a originou, e vive apenas enquanto o formulário existe. Reenvio do mesmo payload reusa a chave; qualquer campo alterado descarta e gera outra; sucesso limpa. **Não é persistida** — recarregar a página a perde.

2. **Transação `PENDING` não tem polling.** Nenhum timer no cliente. Atualizar é sempre ação explícita do usuário.

Quatro foram tomadas para esta fatia:

3. **Transferir não exige contato salvo.** O formulário aceita contato da agenda ou busca ali mesmo, e oferece salvar depois do sucesso.

4. **A validação de fundos fica no servidor.** O disponível aparece como informação e o aviso não bloqueia.

5. **Depósito e transferência têm telas separadas**, com recibo compartilhado.

6. **O recibo tem rota própria**, `/transacoes/:id`, não modal.

## 5. Contatos

Rota `/contatos`.

**Buscar e salvar** é um fluxo de dois passos porque o gateway obriga: instituição, agência e número vão para `POST /contacts/lookup`, que devolve o titular. **A tela de confirmação é o coração da segurança aqui** — é onde o usuário lê o nome de quem vai receber o dinheiro antes de qualquer coisa acontecer. Só depois de confirmar é que `POST /contacts` grava, com o `account_id` que o lookup devolveu e um apelido.

O `holder_name` vem mascarado pelo gateway. A interface exibe o que veio e não mascara de novo nem revela mais.

**Erros próprios:** `CONTACT_OWN_ACCOUNT` (tentar salvar a própria conta), `CONTACT_ALREADY_EXISTS` e `ACCOUNT_NOT_FOUND` no lookup. Os três já estão traduzidos.

**A lista** mostra apelido, titular mascarado, instituição, agência e número. Favoritos primeiro — o `is_favorite` existe no gateway para isso. **A ordenação é feita no cliente**, sobre a lista que `GET /contacts` devolve: favoritos antes, e dentro de cada grupo por apelido. O gateway não promete ordem, e depender de uma que ele não garante é defeito que só aparece quando o servidor muda. Ações: favoritar, renomear o apelido (limite de 50 caracteres, que é o do gateway) e remover, esta com confirmação.

## 6. Transferência

Rota `/transferir`.

**Origem** sai das contas do usuário, que a 3b já busca. Conta encerrada não aparece porque `GET /accounts` não a devolve — é comportamento do gateway, e a interface não filtra por conta própria.

**Destino aceita duas entradas**, e essa é a decisão de desenho central desta tela: escolher um contato salvo, ou buscar por instituição, agência e número ali mesmo. A segunda entrada usa o mesmo `POST /contacts/lookup` da tela de contatos e mostra o mesmo passo de confirmação do titular.

Depois de uma transferência bem-sucedida para uma conta que não estava na agenda, o recibo oferece salvar como contato. O `account_id` já está em mãos, então é um clique — e é o momento em que o usuário sabe que quer guardar aquele destino.

**O disponível** aparece como informação, e um aviso não-bloqueante quando o valor digitado passa dele. O botão continua ativo. Duas razões: o disponível derivado pode estar **maior** que o real quando há mais de 100 transações depois de uma pendência antiga — furo declarado na §6 do spec da 3b —, e uma segunda autoridade sobre dinheiro no cliente é exatamente o que cria divergência entre o que a tela promete e o que o servidor faz. Quem decide é o gateway, e `INSUFFICIENT_FUNDS` traz o número real no `details`.

**Erros próprios:** `SAME_ACCOUNT_TRANSFER`, `INSUFFICIENT_FUNDS`, `ACCOUNT_NOT_FOUND` e `IDEMPOTENCY_KEY_REUSED`. Todos já traduzidos.

## 7. Depósito

Rota `/depositar`. Conta e valor, nada mais — é o que o `DepositIn` pede.

Depósito é a única forma de pôr dinheiro numa conta, e por isso é ele que destrava o teste ponta a ponta com saldo real.

## 8. O recibo

Rota `/transacoes/:id`. Serve as duas operações, porque o gateway devolve o mesmo `TransactionOut` nas duas.

Mostra valor, tipo, destino e **o estado dito com todas as letras**. `PENDING` não é um rótulo discreto: a tela diz que a transação foi aceita e ainda não foi concluída. Um botão busca o estado atual via `GET /transactions/{id}`, sob comando do usuário. Nenhum timer.

**Duas propriedades que valem ser explícitas:**

O recibo **sobrevive ao recarregamento**. A `Idempotency-Key` morre com o formulário, mas o recibo é endereçado pelo `id` da transação — a rota continua funcionando depois de fechar o navegador. Isso é o que torna aceitável não persistir a chave.

O **202 contra 200** deixa de ser detalhe de protocolo. `202` é "criei agora"; `200` é "você já tinha mandado isto, e aqui está". A interface diz qual dos dois aconteceu, em vez de fingir que são a mesma coisa.

**Nenhum botão de repetir.** Repetir com a mesma chave devolveria a transação antiga em vez de mandar dinheiro de novo, e uma tela que promete uma coisa e faz outra é pior que uma tela sem o botão. Quem quiser transferir de novo volta ao formulário, onde uma intenção nova gera uma chave nova.

## 9. Falhas da transação

Uma transação `FAILED` carrega um `failure_reason` do conjunto fechado de três códigos. O recibo traduz **por código**, nunca exibindo o texto do servidor — a mesma regra que vale para o envelope de erro.

`SOURCE_ACCOUNT_UNAVAILABLE` e `DESTINATION_ACCOUNT_UNAVAILABLE` **não estão no catálogo** e entram nos dois dicionários nesta fatia. `INSUFFICIENT_FUNDS` já está.

Motivo desconhecido cai numa mensagem genérica com aviso no console, como já acontece com código de erro desconhecido.

## 10. A chave de idempotência, em detalhe

A chave é gerada quando o usuário monta uma intenção e fica presa ao payload que a originou. Reenviar o mesmo payload — porque a rede caiu, porque o usuário clicou duas vezes — manda a mesma chave, e o gateway devolve `200` com a transação que já existe em vez de criar outra. Alterar qualquer campo descarta a chave e gera outra, porque virou outra intenção. Sucesso limpa.

Ela **não é persistida**. Recarregar a página a perde, e isso é aceito: o recibo com rota própria responde à pergunta "passou?" sem depender dela.

`IDEMPOTENCY_KEY_REUSED` é o `409` que o gateway devolve quando a mesma chave chega com um payload diferente. Se a interface estiver correta isso não deveria acontecer, e é justamente por isso que precisa ser tratado e testado — é o sinal de que a regra da chave foi quebrada.

## 11. Testes

**Vitest com MSW** para os formulários, os três estados do recibo, o ciclo de vida da chave de idempotência, e as três falhas traduzidas.

**Três testes que existem para pegar defeito silencioso:**

1. **A chave sobrevive ao reenvio e morre na edição.** Enviar duas vezes o mesmo payload manda a mesma chave; mudar um campo entre as tentativas manda outra. Um teste que só verificasse "existe uma chave" passaria com a implementação errada.

2. **O 200 é distinguido do 202.** A tela precisa dizer coisas diferentes, e o teste falha se ela tratar os dois igual.

3. **`failure_reason` desconhecido não vaza para a tela.** Um valor fora do conjunto de três cai na mensagem genérica, e nada do servidor aparece cru.

**Playwright contra o gateway real** para o caminho que **fecha a dívida registrada na 3b**: depositar, transferir, e **paginar o extrato de verdade** — impossível até agora, porque não havia como criar transação.

O worker precisa estar rodando para a transação sair de `PENDING`. Se ele não estiver, o teste verifica até o `202` e o estado pendente, e para aí — declarado no relatório, nunca disfarçado de verificação completa.

**Restrição de segurança que continua valendo:** a fila SQS `api-processar-transferencia-worker.fifo` é compartilhada entre desenvolvimento e produção. Transferência e depósito publicam nela por natureza, então o teste ponta a ponta desta fatia **é** o primeiro que a toca. Ele só pode rodar contra o ambiente local, com dados próprios por execução, e nunca em automação que rode sozinha.

## 12. Riscos aceitos

1. **O disponível exibido pode ficar maior que o real**, herdado da §6 da 3b. O aviso não-bloqueante carrega esse risco de propósito; a correção definitiva é expor o campo no gateway e continua registrada como follow-up.
2. **A chave de idempotência não sobrevive ao recarregamento.** Mitigado pelo recibo com rota própria.
3. **Sem atualização automática.** O estado de uma transação pendente só muda quando o usuário pede.
4. **O e2e depende do worker** para verificar o ciclo completo. Sem ele, a verificação para no estado pendente.

## 13. Critérios de aceitação

1. Buscar uma conta por instituição, agência e número mostra o titular antes de qualquer gravação.
2. Salvar a própria conta como contato mostra a mensagem própria, traduzida.
3. Contato duplicado mostra a mensagem própria, distinta da anterior.
4. A lista de contatos mostra favoritos primeiro.
5. Renomear e remover contato refletem na lista sem recarregar a página.
6. Transferir para um contato salvo cria a transação e leva ao recibo.
7. Transferir para uma conta buscada na hora, sem salvar, funciona igual.
8. Depois de transferir para conta não salva, o recibo oferece salvar como contato, e salvar funciona.
9. Transferir da conta para ela mesma mostra a mensagem de `SAME_ACCOUNT_TRANSFER`.
10. Valor acima do disponível mostra aviso, **e o botão continua ativo**.
11. Saldo insuficiente de verdade mostra a mensagem do servidor traduzida por código.
12. Depositar cria a transação e leva ao recibo.
13. O recibo mostra `PENDING` como "aceita, ainda não concluída", e o botão de atualizar busca o estado atual.
14. Uma transação criada agora (`202`) e uma reapresentada (`200`) produzem textos diferentes na tela — o segundo diz ao usuário que aquele envio já tinha sido feito, em vez de sugerir que acabou de acontecer.
15. Reenviar o mesmo payload usa a mesma chave; alterar um campo gera outra.
16. Transação `FAILED` mostra o motivo traduzido por código, e um motivo desconhecido cai na mensagem genérica sem vazar texto do servidor.
17. O recibo continua acessível depois de recarregar o navegador.

## 14. Ponte para a Fatia 4

O que fica pronto ao fim desta fatia: o produto inteiro exercitável ponta a ponta — criar conta, depositar, transferir, e ver o dinheiro se mover pelo extrato.

O que a Fatia 4 decide e este spec deliberadamente não decide: onde cada peça roda, como as variáveis de ambiente chegam a cada uma, como o worker é escalado, e o que acontece com a fila compartilhada quando existir um ambiente de produção de verdade separado do de desenvolvimento.
