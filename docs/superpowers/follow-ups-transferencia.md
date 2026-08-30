# Follow-ups — redesenho da transferência

## Transferência entre contas próprias — RESOLVIDO

**Situação:** implementada no detalhe da conta (`OwnTransferDialog`), como este
documento previa. O texto abaixo fica como registro do porquê ela mudou de
lugar — a decisão não é óbvia lendo só o código.

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

### O que foi feito

- Ação no detalhe da conta, com a conta atual como origem fixa. ✔
- Destino entre as **outras** contas do mesmo usuário, excluindo a atual e as
  encerradas. ✔
- `useChaveDeIntencao` reaproveitado, com a mesma assinatura. ✔
- `Modal` reaproveitado. ✔

Duas coisas que este documento não previa e foram decididas na
implementação:

- **A ação não é oferecida** quando a conta tem saldo zero ou está encerrada.
  Oferecê-la levaria a pessoa a preencher um formulário que o gateway vai
  recusar, com o erro aparecendo depois do trabalho em vez de antes.
- `useTransferir` já invalidava **as duas** contas em caso de sucesso, com um
  comentário dizendo que podiam ser do mesmo dono. O lado de cache já estava
  pronto para este recurso antes de ele existir.

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

**O primeiro deles foi recuperado**, como este documento pedia, agora em
`OwnTransferDialog.test.tsx`: `transfere para uma conta propria sem passar pelo
lookup`. Junto veio o que faltava — `a propria conta e as encerradas NAO
aparecem como destino` —, que na tela antiga estava espalhado por quatro provas
de regras cruzadas.
