import type { Instituicao } from "@/features/account/types";

export type TipoTransacao = "DEPOSIT" | "TRANSFER";
export type StatusTransacao = "PENDING" | "COMPLETED" | "FAILED";
export type Direcao = "IN" | "OUT";

export type Contraparte = {
  /** Ja vem mascarado pelo gateway. Nunca desmascarar no cliente. */
  holder_name: string;
  branch: string;
  number: string;
  institution: Instituicao;
};

export type ItemExtrato = {
  id: string;
  /**
   * A conta a que ESTA linha pertence.
   *
   * No extrato consolidado, uma transferencia entre contas proprias vem
   * como DUAS linhas com o mesmo id — o debito numa conta e o credito na
   * outra. E este campo que as distingue, e por isso a chave da lista
   * precisa ser id + account_id.
   */
  account_id: string;
  type: TipoTransacao;
  direction: Direcao;
  /** Decimal do Pydantic: string ou numero. */
  amount: string | number;
  status: StatusTransacao;
  is_between_own_accounts: boolean;
  counterparty: Contraparte | null;
  created_at: string;
};

export type PaginaExtrato = {
  items: ItemExtrato[];
  next_cursor: string | null;
};

export type TotaisDoPeriodo = {
  /** Decimal do Pydantic: string ou numero. */
  total_in: string | number;
  total_out: string | number;
  /**
   * Transferencias entre contas do proprio usuario.
   *
   * Fora de total_in e total_out porque a pessoa nao ganhou nem perdeu
   * dinheiro — mas com cifra propria, porque aparecem na lista como duas
   * linhas e precisam ser explicadas. Sempre zero no extrato de uma conta
   * so.
   */
  total_internal: string | number;
};

export type PaginaDoPeriodo = {
  items: ItemExtrato[];
  next_cursor: string | null;
  /** Do periodo INTEIRO, nao da pagina. Nao somar no cliente. */
  totals: TotaisDoPeriodo;
};

export type FiltroDePeriodo = {
  date_from: string;
  date_to: string;
  /** Ausente significa TODAS as contas do usuario. */
  account_id?: string;
};
