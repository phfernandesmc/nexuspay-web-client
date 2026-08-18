# Fatia 3d — Transferência entre contas próprias e o disponível correto

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir transferência entre contas do próprio usuário e substituir o disponível estimado no cliente por um número exato vindo do gateway.

**Architecture:** O gateway passa a expor `pending_outgoing` em cada conta, reaproveitando a soma que ele já calcula na validação de transferência. O frontend deixa de derivar o disponível lendo as 100 primeiras transações do extrato e passa a subtrair dois campos que chegam juntos. O destino da transferência ganha um grupo com as contas do próprio usuário, que o gateway já aceita.

**Tech Stack:** Gateway — Python 3.14, FastAPI, SQLAlchemy 2.0 async, Pydantic v2, `uv`, pytest. Frontend — React 19, Vite 8, TypeScript 7, TanStack Query 5, i18next, Vitest com MSW, Playwright.

**Spec:** `nexuspay-web-client/docs/superpowers/specs/2026-08-18-fatia-3d-conta-propria-e-disponivel-design.md`

## Global Constraints

**Esta fatia atravessa DOIS repositórios.** As Tasks 1 e 2 são executadas em `c:\Users\ferna\Desktop\projects\nexus\nexuspay-api-gateway`; as Tasks 3 a 7, em `c:\Users\ferna\Desktop\projects\nexus\nexuspay-web-client`. Cada repositório tem sua própria branch e seus próprios commits.

**No gateway:**
- Identificadores em inglês, comentários e nomes de teste em português — é o padrão do repositório.
- Dinheiro é `Decimal`, nunca `float`.
- **Nunca rode `alembic downgrade` contra o banco de desenvolvimento `nexuspay`** — isso já destruiu dados uma vez.
- Esta fatia **não** muda o schema do banco: `pending_outgoing` é calculado, não armazenado. Nenhuma migration.

**No frontend:**
- **Nenhuma string visível fora do i18next**, e toda chave nova nos **dois** dicionários (`src/locales/pt-BR.json` e `src/locales/en.json`). Chave num e ausente no outro é defeito.
- **Dinheiro em centavos inteiros**, via `paraCentavos`, `somarCentavos` e `formatarDinheiro` de `@/lib/money`. Nunca reimplemente formatação nem soma.
- **A formatação segue o idioma, a moeda não** — sempre `BRL`.
- **Erro traduzido por código, nunca pela mensagem do servidor:** `t(codigoTraduzivel(extrairErro(falha).code), { ns: "errors" })`. Use `codigoTraduzivel`, **nunca** `chaveDeTraducao`.
- **Nenhum estado otimista. Nenhum polling, nenhum timer.**
- **Chaves de cache sempre pelo registro `CHAVES`**, nunca array literal.
- O projeto usa **`react-router` v8** — importe de `"react-router"`, não de `"react-router-dom"`.
- O `Button` é `@base-ui/react` e usa a prop `render`, **não** `asChild`; não existe `exact` em `ByRoleOptions` do Testing Library.
- O `getNodeText` do Testing Library **concatena nós de texto irmãos** — se um elemento tem rótulo e valor como irmãos, nenhum elemento tem o valor isolado. Use regex ou `within()` **no teste**.

**Nos dois:**
- Commits em português, formato `tipo: descrição`, terminando com:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- **A fila SQS `api-processar-transferencia-worker.fifo` é compartilhada entre desenvolvimento e produção.** Nenhum teste desta fatia publica nela, e **o worker não pode ser subido localmente** — ele consumiria mensagens de produção contra o banco de desenvolvimento.

## Estrutura de arquivos

**Gateway** (`nexuspay-api-gateway`):
- `app/domains/transaction/repository.py` — ganha a consulta agrupada por dono
- `app/domains/account/schemas.py` — `AccountOut` ganha `pending_outgoing`
- `app/domains/account/service.py` — devolve conta e pendente juntos
- `app/domains/account/router.py` — os quatro endpoints que devolvem `AccountOut`
- `tests/integration/test_account_router.py` — o contrato novo
- `tests/integration/test_transaction_repository.py` — a consulta agrupada (arquivo novo)

**Frontend** (`nexuspay-web-client`):
- `src/features/account/types.ts` — `Conta` ganha `pending_outgoing`
- `src/features/statement/PendingBalanceLine.tsx` — lê da conta, sem consulta própria
- `src/features/transaction/TransferPage.tsx` — disponível da conta, e destino de conta própria
- `src/features/account/AccountCard.tsx` — saldo e disponível
- `src/features/statement/queries.ts` — perde `usePendentesDeSaida`
- `src/features/account/queries.ts` — `CHAVES` perde `extratoPendentes`
- `src/features/transaction/queries.ts` — `invalidarTudoDeConta` perde a chave
- `src/locales/pt-BR.json`, `src/locales/en.json` — chave do disponível no cartão

---

### Task 1: A consulta agrupada de pendentes (gateway)

**Repositório:** `c:\Users\ferna\Desktop\projects\nexus\nexuspay-api-gateway`

**Files:**
- Modify: `app/domains/transaction/repository.py`
- Test: `tests/integration/test_transaction_repository.py` (criar)

**Interfaces:**
- Consumes: `Transaction`, `TransactionStatus` de `app.domains.transaction.models`; a sessão async do SQLAlchemy.
- Produces: `TransactionRepository.sum_pending_outgoing_by_accounts(account_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, Decimal]` — uma consulta só, agrupada, devolvendo zero para conta sem pendência.

**Contexto.** O `sum_pending_outgoing(account_id)` já existe e é usado na validação de transferência; ele continua. O que falta é a versão em lote, para a listagem não fazer uma consulta por conta.

- [ ] **Step 1: Escreva o teste**

Crie `tests/integration/test_transaction_repository.py`:

```python
import uuid
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.transaction.models import Transaction, TransactionStatus
from app.domains.transaction.repository import TransactionRepository

USER = {
    "full_name": "Joao Silva",
    "email": "joao@example.com",
    "document": "39053344705",
    "password": "senha123",
}


async def _register(client: AsyncClient) -> dict[str, str]:
    response = await client.post("/api/v1/auth/register", json=USER)
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def _abrir_conta(client: AsyncClient, headers: dict) -> str:
    instituicoes = await client.get("/api/v1/institutions", headers=headers)
    response = await client.post(
        "/api/v1/accounts",
        headers=headers,
        json={
            "institution_id": instituicoes.json()[0]["id"],
            "type": "CHECKING",
            "alias": None,
        },
    )
    return response.json()["id"]


async def test_soma_agrupada_devolve_zero_para_conta_sem_pendencia(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _register(client)
    conta_id = await _abrir_conta(client, headers)

    somas = await TransactionRepository(db_session).sum_pending_outgoing_by_accounts(
        [uuid.UUID(conta_id)]
    )

    # Conta sem transacao nenhuma precisa aparecer com zero, nao sumir do
    # dicionario: quem consome usa o valor direto, e um KeyError aqui viraria
    # 500 na listagem de contas de todo usuario novo.
    assert somas == {uuid.UUID(conta_id): Decimal("0")}


async def test_soma_agrupada_bate_com_a_individual(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _register(client)
    conta_id = await _abrir_conta(client, headers)
    outra_id = await _abrir_conta(client, headers)

    # O deposito exige o cabecalho Idempotency-Key: sem ele o gateway
    # devolve 422 e o teste passaria a medir a coisa errada.
    await client.post(
        "/api/v1/transactions/deposit",
        headers={**headers, "Idempotency-Key": str(uuid.uuid4())},
        json={"account_id": conta_id, "amount": "500.00"},
    )

    repositorio = TransactionRepository(db_session)
    agrupada = await repositorio.sum_pending_outgoing_by_accounts(
        [uuid.UUID(conta_id), uuid.UUID(outra_id)]
    )
    individual = await repositorio.sum_pending_outgoing(uuid.UUID(conta_id))

    assert agrupada[uuid.UUID(conta_id)] == individual
    assert agrupada[uuid.UUID(outra_id)] == Decimal("0")


async def test_saida_completed_nao_entra_na_soma(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Os dois filtros da consulta, exercitados um de cada vez.

    Um deposito nasce com source_account_id NULL e status PENDING. O UPDATE
    direto transforma a mesma linha nos dois casos que importam: saida
    PENDING, que conta, e saida COMPLETED, que ja saiu do saldo e nao pode
    ser reservada de novo.
    """
    headers = await _register(client)
    conta_id = await _abrir_conta(client, headers)
    conta = uuid.UUID(conta_id)

    criada = await client.post(
        "/api/v1/transactions/deposit",
        headers={**headers, "Idempotency-Key": str(uuid.uuid4())},
        json={"account_id": conta_id, "amount": "500.00"},
    )
    transacao = uuid.UUID(criada.json()["id"])

    repositorio = TransactionRepository(db_session)

    # Vira SAIDA pendente: passa a contar.
    await db_session.execute(
        update(Transaction)
        .where(Transaction.id == transacao)
        .values(source_account_id=conta, status=TransactionStatus.PENDING)
    )
    somas = await repositorio.sum_pending_outgoing_by_accounts([conta])
    assert somas[conta] == Decimal("500.00")

    # Vira SAIDA concluida: para de contar.
    await db_session.execute(
        update(Transaction)
        .where(Transaction.id == transacao)
        .values(status=TransactionStatus.COMPLETED)
    )
    somas = await repositorio.sum_pending_outgoing_by_accounts([conta])
    assert somas[conta] == Decimal("0")


async def test_soma_agrupada_com_lista_vazia_devolve_dicionario_vazio(
    db_session: AsyncSession,
) -> None:
    # A listagem de um usuario sem conta nenhuma chama com lista vazia. Um
    # IN () invalido no SQL quebraria a tela inicial de todo usuario novo.
    somas = await TransactionRepository(db_session).sum_pending_outgoing_by_accounts([])

    assert somas == {}
```

O `client` e o `db_session` são fixtures que já existem em `tests/conftest.py` — não crie fixtures novas.

- [ ] **Step 2: Rode o teste e confirme que falha**

Run: `uv run pytest tests/integration/test_transaction_repository.py -v`
Expected: FAIL com `AttributeError: 'TransactionRepository' object has no attribute 'sum_pending_outgoing_by_accounts'`.

- [ ] **Step 3: Escreva a consulta**

Em `app/domains/transaction/repository.py`, logo depois de `sum_pending_outgoing`, acrescente:

```python
    async def sum_pending_outgoing_by_accounts(
        self, account_ids: Sequence[uuid.UUID]
    ) -> dict[uuid.UUID, Decimal]:
        """Uma consulta so para varias contas, para a listagem nao fazer N.

        Contas sem pendencia nao aparecem no GROUP BY, entao o dicionario e
        pre-preenchido com zero: quem consome usa o valor direto, e um
        KeyError aqui viraria 500 na listagem de todo usuario novo.
        """
        somas: dict[uuid.UUID, Decimal] = {item: Decimal("0") for item in account_ids}
        if not somas:
            return somas

        result = await self._session.execute(
            select(
                Transaction.source_account_id,
                func.coalesce(func.sum(Transaction.amount), 0),
            )
            .where(
                Transaction.source_account_id.in_(list(somas)),
                Transaction.status == TransactionStatus.PENDING,
            )
            .group_by(Transaction.source_account_id)
        )
        for account_id, total in result.all():
            somas[account_id] = Decimal(total)
        return somas
```

Acrescente `Sequence` ao import de `collections.abc` no topo do arquivo, criando a linha se ela não existir:

```python
from collections.abc import Sequence
```

- [ ] **Step 4: Rode o teste e confirme que passa**

Run: `uv run pytest tests/integration/test_transaction_repository.py -v`
Expected: PASS, 4 testes.

- [ ] **Step 5: Prove que o teste discrimina**

Troque temporariamente o pré-preenchimento por um dicionário vazio:

```python
        somas: dict[uuid.UUID, Decimal] = {}
        if not account_ids:
            return somas
```

Run: `uv run pytest tests/integration/test_transaction_repository.py -v`
Expected: FAIL — `test_soma_agrupada_devolve_zero_para_conta_sem_pendencia` falha, porque o dicionário volta vazio em vez de trazer a conta com zero.

**Restaure o arquivo** e rode de novo. Expected: PASS, 4 testes.

- [ ] **Step 6: Rode a suíte inteira**

Run: `uv run pytest -q`
Expected: PASS, sem regressão.

- [ ] **Step 7: Commit**

```bash
git add app/domains/transaction/repository.py tests/integration/test_transaction_repository.py
git commit -m "feat: soma agrupada de saidas pendentes por conta

Conta sem pendencia nao aparece no GROUP BY, entao o dicionario e
pre-preenchido com zero: quem consome usa o valor direto, e um KeyError
viraria 500 na listagem de todo usuario novo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `pending_outgoing` no `AccountOut` (gateway)

**Repositório:** `c:\Users\ferna\Desktop\projects\nexus\nexuspay-api-gateway`

**Files:**
- Modify: `app/domains/account/schemas.py`, `app/domains/account/service.py`, `app/domains/account/router.py`
- Test: `tests/integration/test_account_router.py`

**Interfaces:**
- Consumes: `TransactionRepository.sum_pending_outgoing` e `sum_pending_outgoing_by_accounts` da Task 1.
- Produces: `AccountOut.pending_outgoing: Decimal`; `AccountService.list_accounts(owner_id) -> list[tuple[Account, Decimal]]`; `AccountService.get_account(...) -> tuple[Account, Decimal]`; `AccountService.rename(...) -> tuple[Account, Decimal]`; e `AccountOut.from_account(account, pending_outgoing)`.

**Atenção: são QUATRO endpoints que devolvem `AccountOut`** — `POST /accounts`, `GET /accounts`, `GET /accounts/{id}` e `PATCH /accounts/{id}`. Esquecer um deles quebra a resposta só naquele caminho, e o frontend receberia um campo faltando exatamente onde ninguém olhou.

Para a conta recém-aberta, o pendente é sempre zero — ela não tem transação nenhuma. Não vale uma consulta para descobrir isso.

- [ ] **Step 1: Escreva os testes**

Acrescente ao final de `tests/integration/test_account_router.py`:

```python
async def test_conta_nova_vem_com_pendente_zero(client: AsyncClient) -> None:
    headers = await _register(client, USER_A)
    institution_id = await _first_institution_id(client, headers)

    response = await client.post(
        "/api/v1/accounts",
        headers=headers,
        json={"institution_id": institution_id, "type": "CHECKING", "alias": None},
    )

    assert response.json()["pending_outgoing"] == "0.00"


async def test_listagem_e_detalhe_trazem_o_mesmo_pendente(client: AsyncClient) -> None:
    headers = await _register(client, USER_A)
    institution_id = await _first_institution_id(client, headers)
    criada = await client.post(
        "/api/v1/accounts",
        headers=headers,
        json={"institution_id": institution_id, "type": "CHECKING", "alias": None},
    )
    conta_id = criada.json()["id"]

    listagem = await client.get("/api/v1/accounts", headers=headers)
    detalhe = await client.get(f"/api/v1/accounts/{conta_id}", headers=headers)

    da_lista = next(
        item for item in listagem.json() if item["id"] == conta_id
    )["pending_outgoing"]
    assert Decimal(da_lista) == Decimal(detalhe.json()["pending_outgoing"])


async def test_renomear_tambem_devolve_o_pendente(client: AsyncClient) -> None:
    headers = await _register(client, USER_A)
    institution_id = await _first_institution_id(client, headers)
    criada = await client.post(
        "/api/v1/accounts",
        headers=headers,
        json={"institution_id": institution_id, "type": "CHECKING", "alias": None},
    )

    response = await client.patch(
        f"/api/v1/accounts/{criada.json()['id']}",
        headers=headers,
        json={"alias": "Salario"},
    )

    # O PATCH devolve AccountOut como os outros tres. Sem o campo aqui, o
    # frontend perderia o disponivel exatamente depois de renomear.
    assert "pending_outgoing" in response.json()


async def test_saida_pendente_entra_no_pendente_e_entrada_nao(
    client: AsyncClient,
) -> None:
    headers_a = await _register(client, USER_A)
    headers_b = await _register(client, USER_B)
    institution_id = await _first_institution_id(client, headers_a)

    async def abrir(headers: dict) -> str:
        criada = await client.post(
            "/api/v1/accounts",
            headers=headers,
            json={"institution_id": institution_id, "type": "CHECKING", "alias": None},
        )
        return criada.json()["id"]

    conta_a = await abrir(headers_a)
    conta_b = await abrir(headers_b)

    # Deposito na conta de A: e ENTRADA pendente. Nao reduz o que A pode
    # gastar, entao nao pode entrar na soma.
    await client.post(
        "/api/v1/transactions/deposit",
        headers={**headers_a, "Idempotency-Key": str(uuid.uuid4())},
        json={"account_id": conta_a, "amount": "500.00"},
    )

    detalhe = await client.get(f"/api/v1/accounts/{conta_a}", headers=headers_a)
    assert Decimal(detalhe.json()["pending_outgoing"]) == Decimal("0")

    # A conta de B recebe: para B isso tambem e entrada, e tambem nao conta.
    detalhe_b = await client.get(f"/api/v1/accounts/{conta_b}", headers=headers_b)
    assert Decimal(detalhe_b.json()["pending_outgoing"]) == Decimal("0")
```

- [ ] **Step 2: Rode os testes e confirme que falham**

Run: `uv run pytest tests/integration/test_account_router.py -v -k pendente`
Expected: FAIL — `KeyError: 'pending_outgoing'`.

- [ ] **Step 3: Acrescente o campo ao schema**

Em `app/domains/account/schemas.py`, dentro de `AccountOut`, acrescente o campo depois de `balance` e o construtor no fim da classe:

```python
    balance: Decimal
    # Soma crua das saidas PENDING desta conta. O disponivel — saldo menos
    # este numero — e calculado por quem consome, nao aqui.
    pending_outgoing: Decimal
```

E, ainda dentro de `AccountOut`, o construtor:

```python
    @classmethod
    def from_account(cls, account: "Account", pending_outgoing: Decimal) -> "AccountOut":
        """O pending_outgoing nao e atributo do ORM: e calculado por consulta.

        Sem este construtor, cada endpoint montaria o objeto a mao e um deles
        acabaria esquecendo o campo.
        """
        return cls.model_validate(
            account, update={"pending_outgoing": pending_outgoing}
        )
```

Acrescente ao topo do arquivo, se ainda não existirem:

```python
from decimal import Decimal

from app.domains.account.models import Account
```

- [ ] **Step 4: Faça o serviço devolver conta e pendente juntos**

Em `app/domains/account/service.py`, troque os três métodos:

```python
    async def list_accounts(
        self, owner_id: uuid.UUID
    ) -> list[tuple[Account, Decimal]]:
        accounts = await self._accounts.list_active_by_owner(owner_id)
        somas = await self._transactions.sum_pending_outgoing_by_accounts(
            [item.id for item in accounts]
        )
        return [(item, somas[item.id]) for item in accounts]

    async def get_account(
        self, *, owner_id: uuid.UUID, account_id: uuid.UUID
    ) -> tuple[Account, Decimal]:
        account = await self._owned_or_404(owner_id=owner_id, account_id=account_id)
        return account, await self._transactions.sum_pending_outgoing(account.id)
```

E, em `rename`, troque a última linha:

```python
        account.alias = alias
        atualizada = await self._accounts.update(account)
        return atualizada, await self._transactions.sum_pending_outgoing(atualizada.id)
```

ajustando a assinatura de `rename` para `-> tuple[Account, Decimal]`.

Acrescente `from decimal import Decimal` ao topo se não existir.

- [ ] **Step 5: Ajuste os quatro endpoints**

Em `app/domains/account/router.py`:

```python
@router.post("", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
async def open_account(
    payload: AccountCreate, current_user: CurrentUser, session: DbSession
) -> AccountOut:
    account = await _service(session).open_account(
        owner_id=current_user.id,
        institution_id=payload.institution_id,
        type=payload.type,
        alias=payload.alias,
    )
    await session.commit()
    # Conta recem-aberta nao tem transacao nenhuma: o pendente e zero por
    # construcao, e uma consulta para descobrir isso seria desperdicio.
    return AccountOut.from_account(account, Decimal("0"))


@router.get("", response_model=list[AccountOut])
async def list_accounts(
    current_user: CurrentUser, session: DbSession
) -> list[AccountOut]:
    itens = await _service(session).list_accounts(current_user.id)
    return [AccountOut.from_account(conta, pendente) for conta, pendente in itens]


@router.get("/{account_id}", response_model=AccountOut)
async def get_account(
    account_id: uuid.UUID, current_user: CurrentUser, session: DbSession
) -> AccountOut:
    conta, pendente = await _service(session).get_account(
        owner_id=current_user.id, account_id=account_id
    )
    return AccountOut.from_account(conta, pendente)
```

E o `rename_account`, que é o quarto e o mais fácil de esquecer:

```python
@router.patch("/{account_id}", response_model=AccountOut)
async def rename_account(
    account_id: uuid.UUID,
    payload: AccountUpdate,
    current_user: CurrentUser,
    session: DbSession,
) -> AccountOut:
    conta, pendente = await _service(session).rename(
        owner_id=current_user.id, account_id=account_id, alias=payload.alias
    )
    await session.commit()
    return AccountOut.from_account(conta, pendente)
```

Acrescente `from decimal import Decimal` ao topo do router.

- [ ] **Step 6: Rode os testes e confirme que passam**

Run: `uv run pytest tests/integration/test_account_router.py -v`
Expected: PASS.

Run: `uv run pytest -q`
Expected: PASS, sem regressão. **Se algum teste de outro arquivo quebrar por causa da mudança de assinatura do serviço, corrija o teste** — a mudança de contrato é intencional.

- [ ] **Step 7: Prove que o teste do PATCH discrimina**

Em `router.py`, faça o `rename_account` voltar a `AccountOut.model_validate(conta)` sem o campo.

Run: `uv run pytest tests/integration/test_account_router.py -v -k renomear`
Expected: FAIL — o `pending_outgoing` some da resposta.

**Restaure o arquivo** e rode de novo. Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/domains/account tests/integration/test_account_router.py
git commit -m "feat: expor pending_outgoing em cada conta

Sao QUATRO endpoints que devolvem AccountOut, e o construtor from_account
existe para nenhum deles esquecer o campo. Conta recem-aberta recebe zero
por construcao, sem consulta.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: A linha de processamento lê da conta (frontend)

**Repositório:** `c:\Users\ferna\Desktop\projects\nexus\nexuspay-web-client`

**Files:**
- Modify: `src/features/account/types.ts`, `src/features/statement/PendingBalanceLine.tsx`, `src/features/account/AccountDetailPage.tsx`
- Test: `src/features/statement/PendingBalanceLine.test.tsx`

**Interfaces:**
- Consumes: `pending_outgoing` no `AccountOut` da Task 2.
- Produces: `Conta.pending_outgoing: string | number`; `<PendingBalanceLine saldo={string | number} pendente={string | number} />` — **sem** a prop `contaId`, porque não há mais consulta.

**Contexto.** Hoje o componente faz sua própria consulta ao extrato com `limit=100` e trata carregamento e erro. Com o campo vindo junto da conta, ele passa a ser uma função pura dos dois números. O `usePendentesDeSaida` continua existindo nesta task — a Task 4 remove o último consumidor e o apaga.

- [ ] **Step 1: Acrescente o campo ao tipo**

Em `src/features/account/types.ts`, dentro de `Conta`, logo depois de `balance`:

```ts
  /** Decimal do Pydantic: string ou numero. Use paraCentavos de @/lib/money. */
  balance: string | number;
  /** Soma crua das saidas PENDING. O disponivel e balance menos este numero. */
  pending_outgoing: string | number;
```

- [ ] **Step 2: Escreva o teste**

Substitua o conteúdo de `src/features/statement/PendingBalanceLine.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import PendingBalanceLine from "@/features/statement/PendingBalanceLine";
import i18n from "@/app/i18n";

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
});

describe("linha de processamento", () => {
  it("mostra o processando e o disponivel a partir dos dois numeros", () => {
    render(<PendingBalanceLine saldo="500.00" pendente="100.00" />);

    expect(screen.getByText(/400,00/)).toBeInTheDocument();
    expect(screen.getByText(/100,00/)).toBeInTheDocument();
  });

  it("some quando nao ha saida pendente", () => {
    const { container } = render(<PendingBalanceLine saldo="500.00" pendente="0.00" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("soma em centavos inteiros, sem residuo de ponto flutuante", () => {
    // 0.10 e 0.20 quebram em ponto flutuante. Se a subtracao fosse feita em
    // reais, o disponivel sairia com residuo binario.
    render(<PendingBalanceLine saldo="0.30" pendente="0.10" />);

    expect(screen.getByText(/0,20/)).toBeInTheDocument();
    expect(screen.queryByText(/0000/)).not.toBeInTheDocument();
  });

  it("nao faz consulta nenhuma", () => {
    // O componente e uma funcao pura dos dois numeros. Se ele voltasse a
    // consultar, precisaria de QueryClientProvider e este render lancaria.
    expect(() =>
      render(<PendingBalanceLine saldo="500.00" pendente="100.00" />),
    ).not.toThrow();
  });
});
```

- [ ] **Step 3: Rode o teste e confirme que falha**

Run: `npm test -- --run src/features/statement/PendingBalanceLine.test.tsx`
Expected: FAIL — o componente ainda exige `contaId` e um `QueryClientProvider`.

- [ ] **Step 4: Reescreva o componente**

Substitua o conteúdo de `src/features/statement/PendingBalanceLine.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { formatarDinheiro, paraCentavos } from "@/lib/money";

/**
 * O processando e o disponivel, a partir dos dois numeros que ja vieram com
 * a conta.
 *
 * Ate a Fatia 3c isto fazia consulta propria ao extrato com limit=100 e
 * derivava a soma no cliente — com o furo declarado na secao 6 do spec da
 * 3b: uma pendencia antiga empurrada para alem das 100 primeiras fazia o
 * disponivel exibido ficar MAIOR que o real. O gateway passou a expor a
 * soma, entao nao ha mais consulta, nem carregamento, nem erro proprio.
 */
export default function PendingBalanceLine({
  saldo,
  pendente,
}: {
  saldo: string | number;
  pendente: string | number;
}) {
  const { t, i18n } = useTranslation(["statement"]);
  const locale = i18n.resolvedLanguage ?? "pt-BR";
  const centavos = paraCentavos(pendente);

  if (centavos === 0) return null;

  const disponivel = paraCentavos(saldo) - centavos;

  return (
    <dl className="mt-2 text-sm">
      <div className="flex justify-between">
        <dt>{t("statement:processing")}</dt>
        <dd>-{formatarDinheiro(centavos, locale)}</dd>
      </div>
      <div className="flex justify-between font-medium">
        <dt>{t("statement:available")}</dt>
        <dd>{formatarDinheiro(disponivel, locale)}</dd>
      </div>
    </dl>
  );
}
```

- [ ] **Step 5: Ajuste o ponto de uso**

Em `src/features/account/AccountDetailPage.tsx`, troque a montagem do componente para passar os dois números da conta em vez do id:

```tsx
<PendingBalanceLine saldo={conta.balance} pendente={conta.pending_outgoing} />
```

- [ ] **Step 6: Ajuste os mocks que ficaram sem o campo**

O `Conta` agora exige `pending_outgoing`. Rode o TypeScript e corrija **todos** os fixtures de teste que montam uma conta:

Run: `npm run build`
Expected: erros de tipo apontando cada fixture. Acrescente `pending_outgoing: "0.00"` a cada um, **exceto** onde o teste precisa de outro valor.

- [ ] **Step 7: Rode a suíte e confirme que passa**

Run: `npm test -- --run`
Expected: PASS.

- [ ] **Step 8: Prove que o teste discrimina**

No componente, troque `paraCentavos(saldo) - centavos` por `paraCentavos(saldo)`.

Run: `npm test -- --run src/features/statement/PendingBalanceLine.test.tsx`
Expected: FAIL — o teste do disponível e o do ponto flutuante falham.

**Restaure o arquivo** e rode de novo. Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src
git commit -m "feat: linha de processamento le o pendente que vem com a conta

Sem consulta propria, o componente vira funcao pura dos dois numeros — e
perde os estados de carregamento e erro porque perde a consulta.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: O disponível da transferência, e a remoção do cálculo derivado (frontend)

**Repositório:** `c:\Users\ferna\Desktop\projects\nexus\nexuspay-web-client`

**Files:**
- Modify: `src/features/transaction/TransferPage.tsx`, `src/features/statement/queries.ts`, `src/features/account/queries.ts`, `src/features/transaction/queries.ts`
- Delete: `src/features/statement/queries.test.tsx` (só a parte de `usePendentesDeSaida` — ver Step 5)
- Test: `src/features/transaction/TransferPage.test.tsx`

**Interfaces:**
- Consumes: `Conta.pending_outgoing` da Task 3.
- Produces: nada novo. Remove `usePendentesDeSaida` e `CHAVES.extratoPendentes`.

**Contexto.** A `TransferPage` é o último consumidor do `usePendentesDeSaida`. Depois desta task o hook não tem mais dono, e ele sai junto — com a chave de cache dele e com a invalidação que a apontava.

- [ ] **Step 1: Escreva o teste**

Acrescente a `src/features/transaction/TransferPage.test.tsx`, dentro do `describe` que já existe:

```tsx
  it("o disponivel vem da conta, sem consultar o extrato", async () => {
    // Se a tela voltasse a consultar o extrato para descobrir o pendente,
    // este handler seria chamado — e o furo dos 100 itens estaria de volta.
    let consultouExtrato = false;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/:id/statement`, () => {
        consultouExtrato = true;
        return HttpResponse.json({ items: [], next_cursor: null });
      }),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);

    // conta.balance e "500.00" e conta.pending_outgoing e "100.00" no
    // fixture: o disponivel precisa ser 400,00, nao 500,00.
    expect(await screen.findByText(/400,00/)).toBeInTheDocument();
    expect(consultouExtrato).toBe(false);
  });
```

```tsx
  it("falha ao carregar contas nao exibe disponivel nenhum", async () => {
    // Criterio 12 do spec. Sem conta nao ha saldo nem pendente, entao nao ha
    // disponivel a mostrar — e mostrar zero seria pior que nao mostrar nada.
    servidor.use(mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.error()));

    montar();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/Dispon/)).not.toBeInTheDocument();
  });
```

E ajuste o fixture `conta` no topo do arquivo para incluir `pending_outgoing: "100.00"`.

- [ ] **Step 2: Rode o teste e confirme que falha**

Run: `npm test -- --run src/features/transaction/TransferPage.test.tsx`
Expected: FAIL — a tela mostra 500,00 e consulta o extrato.

- [ ] **Step 3: Troque a origem do disponível**

Em `src/features/transaction/TransferPage.tsx`, remova o import e a chamada de `usePendentesDeSaida` e troque o cálculo:

```tsx
  const origem = (contas ?? []).find((c) => c.id === origemId);
  // O pendente vem junto com a conta. Ate a Fatia 3c isto era derivado de
  // uma consulta ao extrato com limit=100, e podia ficar MAIOR que o real.
  const disponivelCentavos =
    origem === undefined
      ? null
      : paraCentavos(origem.balance) - paraCentavos(origem.pending_outgoing);
```

O resto — o `valorCentavos`, o `acimaDoDisponivel`, o aviso não-bloqueante e o botão que **não** desabilita por causa dele — fica exatamente como está.

- [ ] **Step 4: Apague o hook**

Em `src/features/statement/queries.ts`, apague `usePendentesDeSaida` inteiro, junto do bloco de comentário que descreve o furo. Apague também `LIMITE_MAXIMO` e o import de `somarCentavos` se ficarem sem uso.

- [ ] **Step 5: Apague a chave de cache e a invalidação**

Em `src/features/account/queries.ts`, remova a linha `extratoPendentes` do registro `CHAVES`.

Em `src/features/transaction/queries.ts`, remova de `invalidarTudoDeConta` a linha que invalida `CHAVES.extratoPendentes(contaId)`.

Em `src/features/statement/queries.test.tsx` e `src/features/account/queries.test.tsx`, apague os testes que exercitam `usePendentesDeSaida` e `CHAVES.extratoPendentes`. **Não apague os arquivos inteiros** — os dois têm outros testes.

- [ ] **Step 6: Rode a suíte e confirme que passa**

Run: `npm test -- --run`
Expected: PASS.

Run: `npm run build`
Expected: sucesso, sem referência pendente.

- [ ] **Step 7: Confirme que o hook sumiu de verdade**

Run: `grep -rn "usePendentesDeSaida\|extratoPendentes\|LIMITE_MAXIMO" src`
Expected: nenhuma ocorrência.

- [ ] **Step 8: Prove que o teste discrimina**

Na `TransferPage`, troque o cálculo por `paraCentavos(origem.balance)`.

Run: `npm test -- --run src/features/transaction/TransferPage.test.tsx`
Expected: FAIL — `o disponivel vem da conta, sem consultar o extrato` falha, porque a tela mostra 500,00.

**Restaure o arquivo** e rode de novo. Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src
git commit -m "feat: disponivel da transferencia vem da conta, e o furo dos 100 itens sai

O usePendentesDeSaida, a consulta limit=100 e a chave de cache dela foram
removidos junto com o ultimo consumidor. O furo declarado na secao 6 do
spec da 3b deixa de existir.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: O cartão mostra saldo e disponível (frontend)

**Repositório:** `c:\Users\ferna\Desktop\projects\nexus\nexuspay-web-client`

**Files:**
- Modify: `src/features/account/AccountCard.tsx`, `src/locales/pt-BR.json`, `src/locales/en.json`
- Test: `src/features/account/AccountsPage.test.tsx`

**Interfaces:**
- Consumes: `Conta.pending_outgoing` da Task 3.
- Produces: nada novo.

**Contexto.** Hoje o cartão mostra só o saldo cheio, que é o número que engana quando há dinheiro a caminho. Ele passa a mostrar os dois: o saldo, que é o que a conta tem, e o disponível, que é o que dá para gastar. Mostrar só o disponível esconderia dinheiro que é do usuário.

Quando não há saída pendente os dois números são iguais, e aí **só o saldo aparece** — repetir o mesmo valor duas vezes é ruído.

- [ ] **Step 1: Acrescente as chaves de tradução**

Em `src/locales/pt-BR.json`, dentro do bloco `account`:

```json
    "available": "Disponível",
```

Em `src/locales/en.json`, dentro do bloco `account`:

```json
    "available": "Available",
```

- [ ] **Step 2: Escreva o teste**

Acrescente a `src/features/account/AccountsPage.test.tsx`, dentro do `describe` que já existe:

```tsx
  it("o cartao mostra saldo E disponivel quando ha saida pendente", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json([{ ...conta, balance: "500.00", pending_outgoing: "100.00" }]),
      ),
    );

    envolverComQuery(<AccountsPage />);

    expect(await screen.findByText(/500,00/)).toBeInTheDocument();
    expect(screen.getByText(/400,00/)).toBeInTheDocument();
  });

  it("o cartao mostra so o saldo quando nao ha saida pendente", async () => {
    // Sem pendencia os dois numeros sao iguais, e repetir o mesmo valor
    // duas vezes e ruido.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json([{ ...conta, balance: "500.00", pending_outgoing: "0.00" }]),
      ),
    );

    envolverComQuery(<AccountsPage />);

    await screen.findByText(/500,00/);
    expect(screen.queryByText("Disponível")).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Rode o teste e confirme que falha**

Run: `npm test -- --run src/features/account/AccountsPage.test.tsx`
Expected: FAIL — o cartão não mostra 400,00.

- [ ] **Step 4: Acrescente o disponível ao cartão**

Em `src/features/account/AccountCard.tsx`, depois do parágrafo do saldo:

```tsx
      <p className="mt-2 text-xl font-semibold">
        {formatarDinheiro(paraCentavos(conta.balance), i18n.resolvedLanguage ?? "pt-BR")}
      </p>
      {paraCentavos(conta.pending_outgoing) > 0 && (
        <p className="text-sm text-muted-foreground">
          {t("account:available")}:{" "}
          {formatarDinheiro(
            paraCentavos(conta.balance) - paraCentavos(conta.pending_outgoing),
            i18n.resolvedLanguage ?? "pt-BR",
          )}
        </p>
      )}
```

- [ ] **Step 5: Rode a suíte e confirme que passa**

Run: `npm test -- --run`
Expected: PASS.

- [ ] **Step 6: Prove que o teste discrimina**

Troque a condição por `paraCentavos(conta.pending_outgoing) >= 0`.

Run: `npm test -- --run src/features/account/AccountsPage.test.tsx`
Expected: FAIL — `o cartao mostra so o saldo quando nao ha saida pendente` falha.

**Restaure o arquivo** e rode de novo. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/account/AccountCard.tsx src/features/account/AccountsPage.test.tsx src/locales
git commit -m "feat: cartao de conta mostra saldo e disponivel

Sem pendencia os dois numeros sao iguais, entao so o saldo aparece —
repetir o mesmo valor duas vezes e ruido.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Destino de conta própria na transferência (frontend)

**Repositório:** `c:\Users\ferna\Desktop\projects\nexus\nexuspay-web-client`

**Files:**
- Modify: `src/features/transaction/TransferPage.tsx`, `src/locales/pt-BR.json`, `src/locales/en.json`
- Test: `src/features/transaction/TransferPage.test.tsx`

**Interfaces:**
- Consumes: `useContas()` de `@/features/account/queries`, que a tela já usa para a origem.
- Produces: nada novo.

**Contexto, e a razão desta task ser pequena.** O gateway **já aceita** transferência entre contas do mesmo usuário: em `app/domains/transaction/service.py`, a origem é validada como do usuário, mas o destino passa apenas por "existe e não está encerrada". A única recusa é origem igual a destino. A lacuna era só de descoberta — a interface só sabia achar conta pelo `lookup`, que recusa conta própria — e os ids das contas do usuário **já estão carregados nesta tela**.

**A conta escolhida como origem some da lista de destinos.** Isso elimina por construção o erro de mandar para a mesma conta, em vez de deixá-lo acontecer e traduzir a recusa.

- [ ] **Step 1: Acrescente as chaves de tradução**

Em `src/locales/pt-BR.json`, dentro do bloco `transaction`:

```json
    "myAccounts": "Minhas contas",
    "myContacts": "Meus contatos",
```

Em `src/locales/en.json`, dentro do bloco `transaction`:

```json
    "myAccounts": "My accounts",
    "myContacts": "My contacts",
```

- [ ] **Step 2: Escreva os testes**

Acrescente a `src/features/transaction/TransferPage.test.tsx`, dentro do `describe` que já existe. O fixture `conta` já existe no arquivo; acrescente um segundo:

```tsx
const outraConta = {
  ...conta,
  id: "conta-2",
  number: "99999999",
  alias: "Reserva",
};
```

E os casos:

```tsx
  it("transfere para uma conta propria sem passar pelo lookup", async () => {
    let usouLookup = false;
    let corpo: unknown = null;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([conta, outraConta])),
      mswHttp.post(`${URL_TESTE}/contacts/lookup`, () => {
        usouLookup = true;
        return HttpResponse.json({});
      }),
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, async ({ request }) => {
        corpo = await request.json();
        return respostaTransacao(202);
      }),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await screen.findByRole("option", { name: /Reserva/ });
    await usuario.selectOptions(screen.getByLabelText("Destino"), "conta-2");
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() =>
      expect(corpo).toEqual({
        source_account_id: conta.id,
        destination_account_id: "conta-2",
        amount: "100.00",
      }),
    );
    // Conta propria nao precisa de busca: o id ja estava na tela.
    expect(usouLookup).toBe(false);
  });

  it("a conta escolhida como origem NAO aparece entre os destinos", async () => {
    // Mandar para a mesma conta e recusado pelo gateway com
    // SAME_ACCOUNT_TRANSFER. Tirar a origem da lista elimina o erro por
    // construcao, em vez de deixa-lo acontecer e traduzir a recusa.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([conta, outraConta])),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);

    const destino = screen.getByLabelText("Destino");
    await screen.findByRole("option", { name: /Reserva/ });
    expect(
      within(destino).queryByRole("option", { name: /Principal/ }),
    ).not.toBeInTheDocument();
  });

  it("trocar a origem devolve a conta anterior a lista de destinos", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([conta, outraConta])),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await screen.findByRole("option", { name: /Reserva/ });

    await usuario.selectOptions(screen.getByLabelText("Conta de origem"), "conta-2");

    const destino = screen.getByLabelText("Destino");
    expect(within(destino).getByRole("option", { name: /Principal/ })).toBeInTheDocument();
    expect(
      within(destino).queryByRole("option", { name: /Reserva/ }),
    ).not.toBeInTheDocument();
  });
```

Acrescente `within` ao import de `@testing-library/react` no topo do arquivo.

- [ ] **Step 3: Rode os testes e confirme que falham**

Run: `npm test -- --run src/features/transaction/TransferPage.test.tsx`
Expected: FAIL — não existe opção com "Reserva" no destino.

- [ ] **Step 4: Acrescente o grupo de contas próprias**

Em `src/features/transaction/TransferPage.tsx`, troque o `<select>` do destino pelo bloco com dois `<optgroup>`:

```tsx
          <select
            id="transferencia-destino"
            className="rounded border px-2 py-1"
            value={contatoId}
            onChange={(evento) => setContatoId(evento.target.value)}
          >
            <option value="" />
            <optgroup label={t("transaction:myAccounts")}>
              {(contas ?? [])
                // A origem sai da lista: mandar para a mesma conta e recusado
                // pelo gateway, e nao ha por que oferecer o erro.
                .filter((c) => c.id !== origemId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.alias ?? c.number} · {c.institution.name} · {c.number}
                  </option>
                ))}
            </optgroup>
            <optgroup label={t("transaction:myContacts")}>
              {(contatos ?? []).map((contato) => (
                <option key={contato.id} value={contato.id}>
                  {contato.alias} · {contato.target_account.holder_name}
                </option>
              ))}
            </optgroup>
          </select>
```

- [ ] **Step 5: Resolva o id do destino nas três origens**

Ainda em `TransferPage.tsx`, troque o cálculo do `destinoId`:

```tsx
  // As TRES entradas terminam no mesmo lugar: um account_id, que e o que o
  // gateway pede. Conta propria ja tem o id em maos; contato guarda o id da
  // conta alvo; a busca devolve o id.
  const destinoId =
    achada?.account_id ??
    (contas ?? []).find((c) => c.id === contatoId)?.id ??
    (contatos ?? []).find((c) => c.id === contatoId)?.target_account.id ??
    "";
```

A ordem importa: um id de conta própria nunca colide com um id de contato, mas procurar primeiro nas contas deixa explícito que o valor do `select` pode ser das duas naturezas.

- [ ] **Step 6: Rode a suíte e confirme que passa**

Run: `npm test -- --run`
Expected: PASS.

Run: `npm run build`
Expected: sucesso.

- [ ] **Step 7: Prove que o teste discrimina**

Remova o `.filter((c) => c.id !== origemId)`.

Run: `npm test -- --run src/features/transaction/TransferPage.test.tsx`
Expected: FAIL — `a conta escolhida como origem NAO aparece entre os destinos` falha.

**Restaure o arquivo** e rode de novo. Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/transaction/TransferPage.tsx src/features/transaction/TransferPage.test.tsx src/locales
git commit -m "feat: transferir para uma conta propria, sem passar pelo lookup

O gateway ja aceitava: o destino so e validado como existente e nao
encerrada. Faltava a descoberta, e os ids das contas do usuario ja estavam
carregados nesta tela.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Documentação e fechamento dos follow-ups

**Repositório:** `c:\Users\ferna\Desktop\projects\nexus\nexuspay-web-client`

**Files:**
- Modify: `docs/superpowers/follow-ups-fatia-3b.md`, `docs/superpowers/follow-ups-fatia-3c.md`, `README.md`
- Create: `docs/superpowers/follow-ups-fatia-3d.md`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Feche o follow-up do disponível**

Em `docs/superpowers/follow-ups-fatia-3b.md`, marque como **fechado na Fatia 3d** o item que pede expor o saldo disponível no gateway, explicando o que foi feito: o gateway passou a expor `pending_outgoing` em cada conta, e o frontend subtrai. Diga que o furo dos 100 itens deixou de existir porque a consulta que o causava foi removida.

- [ ] **Step 2: Feche a lacuna de produto da transferência entre contas próprias**

Em `docs/superpowers/follow-ups-fatia-3c.md`, marque como **fechado na Fatia 3d** o item que registra que a interface não permitia transferir entre contas do próprio usuário. Explique o desfecho: o gateway sempre aceitou, e a correção foi só de descoberta na interface — nenhuma mudança de regra.

**Não feche** a outra entrada, a do e2e de transferência que depende do worker: ela continua aberta, e continua bloqueada pela fila SQS compartilhada.

- [ ] **Step 3: Atualize o README**

Na seção que descreve o estado do servidor, acrescente que cada conta traz `pending_outgoing` — a soma crua das saídas `PENDING` — e que o disponível é calculado no cliente subtraindo do saldo.

- [ ] **Step 4: Crie o follow-up desta fatia**

Crie `docs/superpowers/follow-ups-fatia-3d.md`:

```markdown
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
```

- [ ] **Step 5: Confirme que os testes seguem verdes**

Run: `npm test -- --run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add docs README.md
git commit -m "docs: fecha os follow-ups do disponivel e da conta propria

O furo dos 100 itens deixou de existir porque a consulta que o causava foi
removida. O e2e de transferencia continua aberto: ele depende do worker, que
consome da fila compartilhada com producao.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verificação final da fatia

Depois da Task 7, antes de qualquer merge:

**No gateway:** `uv run pytest -q` sem regressão.

**No frontend:** `npm test -- --run` e `npm run build` limpos; paridade dos dois dicionários, nenhuma chave presente num e ausente no outro; e `grep -rn "usePendentesDeSaida\|extratoPendentes" src` sem nenhuma ocorrência.

**Ponta a ponta:** o `dinheiro.spec.ts` continua com os dois testes de depósito. Rode com `npx playwright test tests/e2e/dinheiro.spec.ts --workers=1` — a suíte inteira estoura o limitador de `/auth/register`, que é de 5 por minuto por IP contra seis registros por rodada.

**Review da branch inteira**, com o modelo mais capaz disponível, nos **dois** repositórios. Nas Fatias 2b e 3a ela foi pulada e as duas vezes achou defeito sério depois; na 3b e na 3c ela foi feita e achou defeitos que nenhuma review por task poderia ver — inclusive duas repetições literais de defeitos anteriores.
