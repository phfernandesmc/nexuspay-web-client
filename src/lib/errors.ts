import { AxiosError } from "axios";

/**
 * O catalogo do gateway, mantido a mao neste repositorio.
 *
 * Os 24 primeiros vem das classes de excecao de app/core/errors.py. Os tres
 * ultimos nascem nos manipuladores genericos do gateway — rota inexistente,
 * metodo nao suportado e qualquer excecao nao tratada — e por isso nao
 * aparecem numa busca por `raise`. Sao tambem os que surgem justamente
 * quando algo quebrou de verdade, entao esquece-los deixa o usuario com
 * mensagem generica no pior momento possivel.
 *
 * LIMITE CONHECIDO: esta lista nao se atualiza sozinha. O teste de
 * completude pega traducao faltando, mas nao pega codigo novo adicionado ao
 * gateway depois — para isso alguem precisa vir aqui.
 */
export const CODIGOS_DE_ERRO = [
  "INVALID_CREDENTIALS",
  "INVALID_TOKEN",
  "TOKEN_EXPIRED",
  "REFRESH_TOKEN_REUSED",
  "EMAIL_ALREADY_REGISTERED",
  "DOCUMENT_ALREADY_REGISTERED",
  "INVALID_DOCUMENT",
  "WEAK_PASSWORD",
  "ACCOUNT_NOT_FOUND",
  "ACCOUNT_HAS_BALANCE",
  "ACCOUNT_HAS_PENDING_TRANSACTIONS",
  "ACCOUNT_LIMIT_REACHED",
  "ACCOUNT_ALREADY_CLOSED",
  "ACCOUNT_NUMBER_GENERATION_FAILED",
  "INSTITUTION_NOT_FOUND",
  "CONTACT_NOT_FOUND",
  "CONTACT_OWN_ACCOUNT",
  "CONTACT_ALREADY_EXISTS",
  "RATE_LIMIT_EXCEEDED",
  "VALIDATION_ERROR",
  "TRANSACTION_NOT_FOUND",
  "INSUFFICIENT_FUNDS",
  "SAME_ACCOUNT_TRANSFER",
  "IDEMPOTENCY_KEY_REUSED",
  "NOT_FOUND",
  "METHOD_NOT_ALLOWED",
  "INTERNAL_ERROR",
] as const;

export type ErroDaApi = {
  code: string;
  message: string;
  details: Record<string, unknown>;
};

export type CampoInvalido = { field: string; reason: string };

const conhecidos = new Set<string>(CODIGOS_DE_ERRO);

/** Normaliza qualquer falha em um ErroDaApi. Nunca lanca. */
export function extrairErro(erro: unknown): ErroDaApi {
  if (erro instanceof AxiosError) {
    if (!erro.response) {
      // Sem resposta: DNS, offline, CORS, servidor fora. Nao e um codigo do
      // gateway, e merece mensagem propria — dizer "erro interno" aqui
      // manda o usuario procurar problema no lugar errado.
      return { code: "NETWORK_ERROR", message: erro.message, details: {} };
    }
    const corpo = erro.response.data as { error?: Partial<ErroDaApi> } | undefined;
    const envelope = corpo?.error;
    if (envelope?.code) {
      return {
        code: envelope.code,
        message: envelope.message ?? "",
        details: envelope.details ?? {},
      };
    }
  }
  return { code: "INTERNAL_ERROR", message: "", details: {} };
}

export function chaveDeTraducao(code: string): string {
  if (conhecidos.has(code) || code === "NETWORK_ERROR") {
    return `errors.${code}`;
  }
  console.warn(
    `[nexuspay] codigo de erro desconhecido vindo do gateway: ${code}. ` +
      `Acrescente-o a CODIGOS_DE_ERRO e aos dois dicionarios.`,
  );
  return "errors.UNKNOWN";
}

export function camposInvalidos(erro: ErroDaApi): CampoInvalido[] {
  const campos = erro.details?.fields;
  if (!Array.isArray(campos)) return [];
  return campos.filter(
    (c): c is CampoInvalido =>
      typeof c === "object" && c !== null && "field" in c && "reason" in c,
  );
}
