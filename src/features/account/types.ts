export type TipoConta = "CHECKING" | "SAVINGS";
export type StatusConta = "ACTIVE" | "CLOSED";

export type Instituicao = {
  id: string;
  code: string;
  name: string;
  color_hex: string;
};

export type Conta = {
  id: string;
  branch: string;
  number: string;
  alias: string | null;
  type: TipoConta;
  /** Decimal do Pydantic: string ou numero. Use paraCentavos de @/lib/money. */
  balance: string | number;
  status: StatusConta;
  institution: Instituicao;
  created_at: string;
};
