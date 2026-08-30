# Redesenho da tela de transferência — plano de implementação

> **Para executores:** use `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans`. Os passos usam caixas (`- [ ]`).

**Objetivo:** Trazer a transferência para a identidade visual do app e
acrescentar uma revisão antes de mover dinheiro.

**Arquitetura:** A página segue única, com as três seções visíveis. O
indicador de progresso é derivado do estado existente. O carrossel de origem
vira um `radiogroup`. O envio passa por um modal de confirmação. Nenhuma
regra de negócio muda.

**Stack:** React 19, TanStack Query, Vitest, Testing Library, MSW, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-08-30-redesenho-transferencia-design.md`

## Restrições globais

- **Nenhuma asserção de teste pode mudar.** Só o caminho até ela. Uma
  asserção que precise mudar significa comportamento alterado: parar e
  consultar.
- A etapa "Valor" conta como concluída mesmo acima do disponível
  (`transaction:overAvailable` diz "quem decide é o servidor").
- A chave de idempotência vem de `(source_account_id,
  destination_account_id, amount)` e não pode mudar ao abrir/fechar o modal.
- Erros traduzidos por `error.code`, nunca por `error.message`.
- Textos nos dois idiomas (`pt-BR.json` e `en.json`).

---

### Task 1: Helpers de teste contra a tela ATUAL

Isola a mudança mecânica da mudança de comportamento. Ao fim desta tarefa a
suíte está verde **sem nenhuma alteração na tela** — e as tarefas seguintes
tocam um helper cada, em vez de 19 testes.

**Arquivos:**
- Modificar: `src/features/transaction/TransferPage.test.tsx`

- [ ] **Passo 1: Criar os três helpers no topo do arquivo de teste**

```tsx
async function escolherOrigem(usuario: UserEvent, id: string) {
  await usuario.selectOptions(screen.getByLabelText("Conta de origem"), id);
}

async function escolherDestino(usuario: UserEvent, id: string) {
  await usuario.selectOptions(screen.getByLabelText("Destino"), id);
}

async function enviar(usuario: UserEvent) {
  await usuario.click(screen.getByRole("button", { name: "Enviar" }));
}
```

- [ ] **Passo 2: Trocar as 5 seleções de origem, as do destino e os 14
  cliques de envio pelos helpers**

Nenhuma asserção muda. Só as linhas de interação.

- [ ] **Passo 3: Rodar a suíte**

`npx vitest run src/features/transaction/TransferPage.test.tsx`
Esperado: 19 passando, como antes.

- [ ] **Passo 4: Commit**

```bash
git commit -m "test: interacoes da transferencia passam por helpers"
```

---

### Task 2: Indicador de progresso

**Arquivos:**
- Criar: `src/features/transaction/TransferSteps.tsx`
- Criar: `src/features/transaction/TransferSteps.test.tsx`
- Modificar: `src/features/transaction/TransferPage.tsx`
- Modificar: `src/locales/pt-BR.json`, `src/locales/en.json`

**Interfaces:**
- Produz: `<TransferSteps origem={boolean} destino={boolean} valor={boolean} />`

- [ ] **Passo 1: Teste que falha**

```tsx
it("marca como concluida so a etapa preenchida", () => {
  render(<TransferSteps origem destino={false} valor={false} />);
  expect(screen.getByRole("listitem", { name: /Conta/ })).toHaveAttribute(
    "aria-current", "false");
});
```

- [ ] **Passo 2: Rodar e ver falhar** (módulo inexistente → criar stub que
  retorna `null`, rodar de novo e ver falhar por asserção)

- [ ] **Passo 3: Implementar** — lista de três etapas, cada uma com
  `aria-current` e um traço que ganha a cor da marca quando concluída.

- [ ] **Passo 4: Ligar na página** — `valor` concluído quando
  `valorCentavos !== null && valorCentavos > 0`, **sem** olhar
  `acimaDoDisponivel`.

- [ ] **Passo 5: Teste de que acima do disponível ainda conta como concluída**

```tsx
it("valor acima do disponivel ainda conclui a etapa", async () => {
  // A decisao e deliberada: o disponivel do cliente e estimativa.
});
```

- [ ] **Passo 6: Rodar a suíte inteira e commitar**

---

### Task 3: Carrossel de origem como radiogroup

**Arquivos:**
- Criar: `src/features/transaction/SourceAccountPicker.tsx`
- Modificar: `src/features/transaction/TransferPage.tsx`
- Modificar: `src/features/transaction/TransferPage.test.tsx` (só o helper
  `escolherOrigem`)

- [ ] **Passo 1: Teste do grupo de rádio**

```tsx
it("a origem e um grupo de radio, nao botoes soltos", async () => {
  // getByRole("radiogroup") e getAllByRole("radio") com aria-checked
});
```

- [ ] **Passo 2: Rodar e ver falhar**

- [ ] **Passo 3: Implementar** — faixa horizontal com `overflow-x-auto`,
  cada cartão `role="radio"` com `aria-checked`, navegação por setas.

- [ ] **Passo 4: Atualizar SÓ o helper**

```tsx
async function escolherOrigem(usuario: UserEvent, id: string) {
  await usuario.click(screen.getByTestId(`origem-${id}`));
}
```

- [ ] **Passo 5: Rodar a suíte inteira** — as 19 asserções seguem intactas.

- [ ] **Passo 6: Commit**

---

### Task 4: Destino com contatos e manual separados

**Arquivos:**
- Modificar: `src/features/transaction/TransferPage.tsx`
- Modificar: `src/features/transaction/TransferPage.test.tsx` (só o helper
  `escolherDestino`)

- [ ] **Passo 1: Rodar os testes de regra cruzada primeiro** (origem some
  dos destinos; trocar origem limpa/preserva destino) para registrar o
  ponto de partida verde.

- [ ] **Passo 2: Implementar os dois caminhos** — seleção entre contas
  próprias e contatos, e o botão de inserir manualmente que abre o
  `AccountLookup`.

- [ ] **Passo 3: Atualizar SÓ o helper `escolherDestino`**

- [ ] **Passo 4: Rodar a suíte inteira**

- [ ] **Passo 5: Commit**

---

### Task 5: Modal de confirmação

**Arquivos:**
- Criar: `src/features/transaction/TransferConfirm.tsx`
- Modificar: `src/features/transaction/TransferPage.tsx`
- Modificar: `src/features/transaction/TransferPage.test.tsx` (só o helper
  `enviar`)
- Modificar: `src/locales/pt-BR.json`, `src/locales/en.json`

- [ ] **Passo 1: Teste da chave estável**

```tsx
it("abrir e fechar a confirmacao NAO gera chave de idempotencia nova", async () => {
  // captura a chave enviada; abre, fecha, reabre, confirma;
  // espera a MESMA chave. E o que impede hesitacao virar duplicata.
});
```

- [ ] **Passo 2: Rodar e ver falhar**

- [ ] **Passo 3: Implementar** — `Modal` já existente, mostrando origem,
  destino, valor e o disponível resultante.

- [ ] **Passo 4: Atualizar SÓ o helper**

```tsx
async function enviar(usuario: UserEvent) {
  await usuario.click(screen.getByRole("button", { name: "Continuar" }));
  await usuario.click(screen.getByRole("button", { name: "Confirmar" }));
}
```

- [ ] **Passo 5: Rodar a suíte inteira e o build**

- [ ] **Passo 6: Commit**
