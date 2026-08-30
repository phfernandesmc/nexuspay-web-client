# Redesenho da tela de transferência

Data: 2026-08-30

## Objetivo

Trazer a tela de transferência para a identidade visual das demais e
acrescentar uma revisão antes de mover dinheiro. A tela funciona hoje; o
problema é que ela não guia, não mostra progresso e envia sem confirmação.

## O que muda

### 1. Indicador de progresso (três etapas)

Uma barra no topo com **Conta**, **Destino** e **Valor**, marcando cada etapa
como concluída conforme o preenchimento. É **derivado do estado que já
existe** — nenhum estado novo — e puramente de apresentação: a página segue
única, com as três seções visíveis ao mesmo tempo.

**Regra que não pode ser violada:** a etapa "Valor" conta como concluída
quando há um valor legível maior que zero, **mesmo que ele esteja acima do
disponível**. Marcar como pendente nesse caso contradiria uma decisão
deliberada do projeto, registrada no teste `valor acima do disponivel avisa
mas NAO desabilita o botao` e na própria mensagem exibida ao usuário: *"Você
pode enviar mesmo assim — quem decide é o servidor."* O `pending_outgoing` é
uma estimativa do cliente; a autoridade é o gateway.

### 2. Carrossel de contas de origem

O `<select>` de origem vira uma faixa horizontal de cartões, cada um com
banco, tipo e saldo disponível.

**Acessibilidade:** os cartões formam um `radiogroup` — não são botões
soltos. Um grupo de rádio dá navegação por setas e anuncia "selecionado" a
leitores de tela, que é exatamente o que um `<select>` já fazia e não pode
ser perdido na troca.

### 3. Destino: contatos e manual separados

Hoje é um `<select>` com dois `optgroup` (minhas contas, meus contatos) mais
um botão "Buscar outra conta". Passa a ter dois caminhos visualmente
distintos: escolher entre contas próprias e contatos, ou inserir
manualmente.

**Regras que não podem ser violadas** (cada uma tem teste):

- a conta escolhida como origem não aparece entre os destinos;
- trocar a origem devolve a conta anterior à lista de destinos;
- trocar a origem para a conta que era o destino limpa o destino;
- trocar a origem para uma terceira conta preserva o destino já escolhido;
- falha ao carregar contatos mostra alerta **sem** bloquear o resto da tela —
  um erro de rede não pode se disfarçar de "você não tem contatos".

### 4. Modal de confirmação

"Continuar" abre um modal com origem, destino, valor e o disponível
resultante. Confirmar é o que de fato envia.

**Ponto crítico — idempotência:** a chave nasce de
`(source_account_id, destination_account_id, amount)` via
`useChaveDeIntencao`. Nenhum desses três muda enquanto o modal está aberto,
então abrir e confirmar **não pode** gerar chave nova. Abrir, fechar e
reabrir sem alterar nada também deve manter a mesma chave — é o que impede
uma transferência duplicada por hesitação do usuário.

## O que NÃO muda

- O disponível continua vindo da conta, nunca de uma leitura do extrato.
- Espaço em branco no fim do valor não gera chave de idempotência nova.
- Transferência bem-sucedida continua invalidando o saldo em cache da conta
  de destino.
- Erros continuam traduzidos por `error.code`, nunca por `error.message`.
- O sucesso continua navegando para `/transacoes/:id` com
  `criadaAgora` e `destinoNaoSalvo` no state.

## Impacto nos testes

Medido: 5 seleções de origem, 21 referências ao destino e 14 cliques em
"Enviar". Na prática, os 19 testes são tocados.

A mudança é mecânica, não semântica: as asserções continuam as mesmas, muda
como o teste chega até elas. Para não espalhar a estrutura da tela por 659
linhas, as três interações passam por helpers no próprio arquivo de teste —
`escolherOrigem`, `escolherDestino` e `enviar` (que agora clica em
"Continuar" e confirma no modal). Se a tela mudar de novo, muda em três
lugares.

## Riscos

1. **Quebrar uma regra sutil sem perceber.** É o risco principal, e a
   mitigação é não tocar em nenhuma asserção — só no caminho até ela. Uma
   asserção que precise mudar é sinal de comportamento alterado, e deve ser
   discutida em vez de ajustada.
2. **Perder acessibilidade na troca de `<select>` por cartões.** Mitigado
   pelo `radiogroup`; sem ele, a troca seria uma regressão disfarçada de
   melhoria.
3. **Duplicar transferência pelo passo novo.** Mitigado pela chave de
   idempotência estável, com teste próprio: abrir e fechar o modal não gera
   chave nova.
