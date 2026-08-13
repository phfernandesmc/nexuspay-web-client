import type { Instituicao, StatusConta, TipoConta } from "@/features/account/types";

/** A conta de destino como o gateway a devolve dentro de um contato. */
export type ContaAlvo = {
  id: string;
  branch: string;
  number: string;
  /** Ja vem mascarado pelo gateway. Nao mascare de novo nem revele mais. */
  holder_name: string;
  type: TipoConta;
  status: StatusConta;
  institution: Instituicao;
};

export type Contato = {
  id: string;
  alias: string;
  is_favorite: boolean;
  target_account: ContaAlvo;
  created_at: string;
};

/** O que POST /contacts/lookup devolve. Nao tem id de contato: ainda nao existe contato. */
export type ResultadoBusca = {
  account_id: string;
  holder_name: string;
  type: TipoConta;
  institution: Instituicao;
};

export type DadosDaBusca = {
  institution_id: string;
  branch: string;
  number: string;
};
