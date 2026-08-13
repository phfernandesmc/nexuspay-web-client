# Fatia 3b — Contas e extrato

Onde o dinheiro aparece na tela. Abrir, listar, renomear e encerrar contas, e ver o extrato paginado com o estado de cada transação.

Repositório: `nexuspay-web-client`.

---

## 1. O que a Fatia 3a deixa pronto

A 3a está mesclada em `main`, com 69 testes passando.

- **Cliente HTTP** com renovação de sessão em fila única, serializada entre abas pela Web Locks API. Toda chamada da 3b passa por ele e herda isso.
- **Sessão** em memória, com boot silencioso e guarda de rota. A casca autenticada com barra lateral já existe e recebe itens novos sem redesenho.
- **Tradução de erro por código**, com os 27 códigos do catálogo do gateway traduzidos em PT-BR e EN. A 3b não precisa acrescentar nenhum — só passa a exercitar quatro que ninguém tinha exercitado.
- **i18next** com fallback PT-BR e a regra de nenhuma string literal em componente.
- **Vitest com MSW** e **Playwright** contra o gateway real.

## 2. Escopo

**Dentro:** TanStack Query e o padrão de cache; abrir, listar, renomear e encerrar conta; catálogo de instituições; extrato paginado por cursor; o estado `PENDING` visível; e o saldo em processamento derivado.

**Fora, e vai para a Fatia 3c:** contatos, transferência, depósito e a `Idempotency-Key`. Deploy é a Fatia 4.

A separação é limpa porque o extrato não depende de contatos, e a transferência usa contato apenas como seletor.

## 3. Decisões tomadas antes do desenho

Quatro, todas do dono do projeto:

1. **Transação `PENDING` não tem polling.** O usuário atualiza quando quiser. Nenhum timer no cliente.
2. **TanStack Query entra.** O `useInfiniteQuery` casa com o cursor do gateway, e a invalidação por chave resolve o problema de saldo desatualizado entre telas.
3. **`refetchOnWindowFocus` fica desligado.** Nada busca sozinho — nem ao voltar de outra aba. Atualizar é sempre ação explícita.
4. **O saldo disponível é derivado no detalhe da conta**, por uma consulta dedicada. Ver §6, que documenta o furo dessa abordagem.

Uma quinta decisão foi tomada e pertence à 3c, registrada aqui para não se perder: a **`Idempotency-Key` é gerada por intenção**, presa ao payload que a originou, e vive apenas enquanto o formulário existe. Reenvio do mesmo payload reusa a chave; qualquer campo alterado descarta e gera outra; sucesso limpa. Não é persistida — recarregar a página a perde, e o extrato responde a pergunta "passou?".

## 4. Estado de servidor

**A fronteira é explícita: Zustand cuida de sessão e UI; TanStack Query cuida de tudo que vem do servidor.** Nenhum dado de servidor é copiado para o Zustand. Copiar cria duas fontes da verdade, e é assim que um saldo aparece atualizado numa tela e velho na outra.

Versões, verificadas no registro do npm: `@tanstack/react-query` **5.101.4**, que declara compatibilidade com React 19.

**As chaves de cache**, porque é delas que a invalidação depende:

| Chave | Conteúdo |
|---|---|
| `["contas"]` | lista de contas ativas |
| `["conta", id]` | uma conta |
| `["extrato", contaId]` | extrato paginado, `useInfiniteQuery` |
| `["extrato-pendentes", contaId]` | consulta dedicada da §6 |
| `["instituicoes"]` | catálogo, praticamente estático |

**O extrato usa `useInfiniteQuery`**, com `getNextPageParam` lendo o `next_cursor` que o gateway devolve. A paginação do gateway é *keyset* — `tuple_(created_at, id) < cursor` —, então páginas não repetem nem pulam item quando algo novo é inserido durante a navegação.

**Regra de invalidação, escrita e não decidida caso a caso:** toda operação que muda conta invalida `["contas"]`; o que for específico de uma conta invalida também `["conta", id]`, `["extrato", id]` e `["extrato-pendentes", id]`. Esquecer esse passo é o defeito que ninguém nota, porque a tela continua funcionando — só mostrando o número errado.

**Nenhum estado otimista.** Numa operação que depende de um worker assíncrono, antecipar o resultado na tela seria mentir sobre dinheiro.

Com o refetch por foco desligado, os dados ainda se renovam ao navegar: a consulta remonta e busca de novo se estiver velha. Recarregar o navegador é o caminho mais forte; circular entre telas já basta na maioria dos casos.

## 5. Telas

Duas rotas novas, penduradas na casca da 3a.

### `/contas` — a lista

Cartões por conta, usando `institution.color_hex` para diferenciar — o campo existe na API para isso. Cada cartão mostra apelido, agência e número, tipo e **o saldo que a API devolve**.

Ações: abrir conta, e entrar no detalhe.

**Abrir conta** escolhe instituição do catálogo, tipo (`CHECKING` ou `SAVINGS`) e apelido opcional, limitado a 50 caracteres. Erros próprios: `ACCOUNT_LIMIT_REACHED` (o gateway limita a 10 contas ativas) e `INSTITUTION_NOT_FOUND`.

### `/contas/:id` — o detalhe

Cabeçalho com saldo, a linha de processamento da §6, e as ações de renomear e encerrar.

**Renomear** altera só o apelido. **Encerrar** pede confirmação e precisa tratar dois erros que já estão traduzidos: `ACCOUNT_HAS_BALANCE` e `ACCOUNT_HAS_PENDING_TRANSACTIONS` — este último foi acrescentado pela Fatia 2b justamente para impedir encerrar conta com dinheiro a caminho, e é a primeira vez que uma interface o exercita.

Conta encerrada some da listagem mas continua acessível pelo detalhe, com `status` visível — é o comportamento do gateway, e a interface o reflete em vez de esconder.

### O extrato

Lista dentro do detalhe. Cada item mostra direção (`IN`/`OUT`), valor, data, status, e a contraparte quando existe — `holder_name` já vem mascarado pelo gateway, e depósito vem sem contraparte.

`is_between_own_accounts` marca transferência entre contas do próprio usuário, que merece tratamento visual distinto de uma transferência para terceiro.

Paginação por botão de carregar mais, não por rolagem infinita: com o refetch automático desligado, controle explícito é coerente com o resto. Estado vazio próprio para conta sem transações.

**404 é "não encontrada", nunca "sem permissão".** O gateway devolve 404 para conta de outro usuário de propósito — um 403 confirmaria que o id existe. A interface não pode inventar uma mensagem de permissão e desfazer essa proteção.

## 6. O saldo disponível, e o furo declarado

O gateway calcula "disponível = saldo − soma das saídas `PENDING`" apenas dentro da validação de transferência, e só o revela no `details` do erro `INSUFFICIENT_FUNDS`. O `AccountOut` traz somente `balance`.

Sem nada, a tela mente: quem tem R$ 500 com uma saída de R$ 100 ainda pendente vê R$ 500, e uma transferência de R$ 450 falha.

**A solução:** no detalhe da conta, uma consulta dedicada ao extrato com `limit=100` — o teto do gateway — somando as saídas com `direction = "OUT"` e `status = "PENDING"`. O resultado aparece como uma linha de processamento e um disponível calculado.

**O furo, declarado e não escondido:** `PENDING` não é necessariamente recente. Uma transação presa porque o worker caiu fica pendente por horas, e transações mais novas podem empurrá-la para além das 100 primeiras. Nesse caso o disponível exibido fica **maior que o real** — exatamente na situação em que o número mais importa. O extrato não aceita filtro por status, então não há consulta barata que resolva.

Cem transações cobrem qualquer caso realista de uso pessoal, e a alternativa sem furo nenhum seria não mostrar disponível algum. A correção definitiva é expor o campo no gateway, e está registrada como follow-up.

## 7. Dinheiro e datas

**Dinheiro nunca é somado em ponto flutuante.** A soma da §6 converte cada valor para centavos inteiros, soma, e formata no fim. `0.1 + 0.2` em JavaScript dá `0.30000000000000004`, e num total visível isso aparece.

O `Decimal` do Pydantic pode chegar como **string ou número** conforme a versão — os testes da 3a já tratavam disso. O parse aceita os dois e falha alto se receber outra coisa.

**Formatação segue o idioma, a moeda não.** `Intl.NumberFormat` com o locale ativo e sempre `BRL`: em inglês sai `R$ 1,200.00`, não `$`. Datas com `Intl.DateTimeFormat`. Trocar o idioma reformata a tela sem nova requisição.

## 8. Erros

Nenhum código novo. O catálogo da 3a cobre os 27 do gateway, e a 3b é a primeira fatia a exercitar `ACCOUNT_LIMIT_REACHED`, `ACCOUNT_HAS_BALANCE`, `ACCOUNT_HAS_PENDING_TRANSACTIONS` e `INSTITUTION_NOT_FOUND`.

A tradução continua por `error.code`, nunca por `error.message`, e código desconhecido cai na mensagem genérica com aviso no console.

## 9. Testes

**Vitest com MSW** para telas, hooks e a soma de pendências.

**Playwright contra o gateway real** para dois caminhos: abrir uma conta e vê-la na lista, e paginar o extrato de verdade.

Dois testes que existem para pegar defeito silencioso:

1. **A invalidação acontece.** Encerrar ou renomear uma conta e confirmar que a lista foi refeita. Saldo ou apelido desatualizado é o defeito que não quebra nada — só mostra o número errado.
2. **A soma é em centavos.** Com valores que quebram em ponto flutuante, provando que o total não carrega resíduo binário.

Na Fatia 3a, duas tasks sem revisor independente concentraram um Critical e cinco Important. A 3b mantém revisão independente por task, sem exceção.

## 10. Riscos aceitos

1. **O disponível pode ficar maior que o real** quando há mais de 100 transações depois de uma pendência antiga (§6). Correção definitiva é no gateway.
2. **Sem atualização automática.** Decisão do dono; o dado renova ao navegar ou recarregar.
3. **Sem estado otimista**, então toda ação espera a resposta do servidor antes de refletir na tela.

## 11. Critérios de aceitação

1. Abrir conta cria e ela aparece na lista sem recarregar a página.
2. Décima primeira conta ativa mostra a mensagem de limite, traduzida.
3. Renomear altera o apelido na lista e no detalhe.
4. Encerrar conta com saldo mostra a mensagem de saldo, e a conta continua ativa.
5. Encerrar conta com transação pendente mostra a mensagem própria de pendência, distinta da de saldo.
6. Encerrar conta zerada e sem pendências some da lista, e o detalhe segue acessível com status encerrado.
7. O extrato lista transações com direção, valor, data, status e contraparte mascarada; depósito aparece sem contraparte.
8. Carregar mais traz a página seguinte sem repetir nem pular item.
9. Conta sem transações mostra estado vazio próprio.
10. O detalhe mostra a linha de processamento quando há saída `PENDING`, e a omite quando não há.
11. A soma de pendências com valores que quebram em ponto flutuante dá o total exato.
12. Trocar o idioma reformata valores e datas sem nova requisição, mantendo `BRL`.
13. Conta de outro usuário mostra "não encontrada", nunca mensagem de permissão.

## 12. Ponte para a Fatia 3c

O que fica pronto: o padrão de cache e invalidação, o catálogo de instituições, a formatação de dinheiro e data, e o extrato — que a 3c vai invalidar depois de cada transferência.

O que a 3c decide e este spec deliberadamente não decide:

- como o seletor de contato se integra ao formulário de transferência
- se depósito e transferência dividem tela ou ficam separados
- o que a interface mostra entre o `202` e o worker resolver a transação
- se o disponível calculado aqui é reaproveitado para validar antes de enviar, ou se a validação fica só no servidor
