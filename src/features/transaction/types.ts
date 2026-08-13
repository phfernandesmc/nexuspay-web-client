export type TipoTransacao = "DEPOSIT" | "TRANSFER";
export type StatusTransacao = "PENDING" | "COMPLETED" | "FAILED";

/**
 * Conjunto FECHADO de tres valores, definido no enum FailureReason do worker.
 * Nao e texto livre: o worker o criou assim para o frontend traduzir por
 * codigo. Um valor fora desta lista cai na mensagem generica.
 */
export const MOTIVOS_DE_FALHA = [
  "INSUFFICIENT_FUNDS",
  "SOURCE_ACCOUNT_UNAVAILABLE",
  "DESTINATION_ACCOUNT_UNAVAILABLE",
] as const;

export type MotivoFalha = (typeof MOTIVOS_DE_FALHA)[number];

export type Transacao = {
  id: string;
  type: TipoTransacao;
  status: StatusTransacao;
  /** Decimal do Pydantic: string ou numero. Use paraCentavos de @/lib/money. */
  amount: string | number;
  source_account_id: string | null;
  destination_account_id: string;
  failure_reason: string | null;
  created_at: string;
};

/**
 * O gateway devolve 202 quando CRIA a transacao e 200 quando a
 * Idempotency-Key ja tinha sido usada e ele esta reapresentando a que existe.
 * A interface precisa dizer coisas diferentes nos dois casos, entao o status
 * viaja junto com o corpo em vez de ser descartado.
 */
export type RespostaTransacao = {
  transacao: Transacao;
  /** true quando o gateway respondeu 202. */
  criadaAgora: boolean;
};
