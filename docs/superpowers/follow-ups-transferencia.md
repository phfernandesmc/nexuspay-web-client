# Follow-ups — redesenho da transferência

## Transferência entre contas próprias saiu da tela de transferência

**O recurso está indisponível no app.** O gateway continua suportando: a rota
`POST /api/v1/transactions/transfer` aceita origem e destino do mesmo dono, o
extrato marca `is_between_own_accounts`, e `SAME_ACCOUNT_TRANSFER` segue
guardando o caso de origem igual a destino. Só a interface deixou de oferecer.

### Por que saiu

O destino da transferência misturava duas coisas com naturezas diferentes:
contas de terceiros (escolhidas por contato ou busca) e contas do próprio
usuário. A segunda arrastava quatro regras cruzadas para a tela — a origem
sumir da lista de destinos, trocar a origem limpar ou preservar o destino — que
existiam apenas por causa dessa mistura.

Com contas próprias fora, essas regras deixam de ter o que proteger: o destino
lista só contatos, e o gateway recusa salvar a própria conta como contato
(`ContactOwnAccount`), então origem e destino não podem coincidir nem por
acidente.

### Onde ela deveria viver

No **detalhe da conta** (`/contas/:id`), que é onde o usuário já está olhando
saldo e extrato daquela conta. "Transferir para outra conta minha" ali tem
contexto que a tela genérica não tem: a conta de origem já está definida, e o
destino é a lista curta das outras contas do mesmo dono.

### O que precisa existir

- Ação no detalhe da conta, com a conta atual como origem fixa.
- Escolha do destino entre as **outras** contas do mesmo usuário, excluindo a
  atual e as encerradas.
- Reaproveitar `useChaveDeIntencao` para a idempotência, com a mesma
  assinatura `(source_account_id, destination_account_id, amount)`.
- Reaproveitar o `Modal` de confirmação da transferência.

### Testes removidos com a mudança

Cinco testes cobriam as regras cruzadas e foram removidos por terem ficado sem
objeto, não por perda de cobertura:

- `transfere para uma conta propria sem passar pelo lookup`
- `a conta escolhida como origem NAO aparece entre os destinos`
- `o destino separa contas proprias e contatos em dois grupos distintos`
- `trocar a origem devolve a conta anterior a lista de destinos`
- `trocar a origem para a conta que era o destino limpa o destino`

O sexto virou `trocar a origem preserva o destino ja escolhido`, que continua
guardando algo real: a troca de origem não pode derrubar em silêncio o
destinatário já escolhido.

**Ao implementar no detalhe da conta, o primeiro deles é o teste a recuperar** —
ele descreve o caminho feliz do recurso.
