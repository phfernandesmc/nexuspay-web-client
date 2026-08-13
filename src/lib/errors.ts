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
  "SOURCE_ACCOUNT_UNAVAILABLE",
  "DESTINATION_ACCOUNT_UNAVAILABLE",
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

/**
 * O codigo pronto para o `t(..., { ns: "errors" })`: o proprio codigo quando
 * ele esta no catalogo, `UNKNOWN` quando nao esta.
 *
 * Existe porque o i18next devolve a PROPRIA CHAVE quando ela nao existe.
 * Passar o codigo cru para o t() funciona para os 27 do catalogo e falha
 * exatamente no caso que mais importa: a familia dinamica `HTTP_<status>`,
 * que o gateway emite para status sem codigo proprio e que o spec define
 * como o caso legitimo da mensagem generica. Sem esta funcao o usuario le
 * "HTTP_502" na tela.
 */
export function codigoTraduzivel(code: string): string {
  if (conhecidos.has(code) || code === "NETWORK_ERROR") {
    return code;
  }
  console.warn(
    `[nexuspay] codigo de erro desconhecido vindo do gateway: ${code}. ` +
      `Acrescente-o a CODIGOS_DE_ERRO e aos dois dicionarios.`,
  );
  return "UNKNOWN";
}

export function chaveDeTraducao(code: string): string {
  return `errors.${codigoTraduzivel(code)}`;
}

export function camposInvalidos(erro: ErroDaApi): CampoInvalido[] {
  const campos = erro.details?.fields;
  if (!Array.isArray(campos)) return [];
  return campos.filter(
    (c): c is CampoInvalido =>
      typeof c === "object" && c !== null && "field" in c && "reason" in c,
  );
}
