import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import ptBR from "@/locales/pt-BR.json";
import en from "@/locales/en.json";

export const IDIOMAS = ["pt-BR", "en"] as const;
export const CHAVE_IDIOMA = "nexuspay.lang";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { "pt-BR": ptBR, en },
    // pt-BR e o fallback porque o dominio e brasileiro: CPF, agencia, conta.
    fallbackLng: "pt-BR",
    supportedLngs: IDIOMAS,
    ns: ["common", "auth", "errors", "account", "statement", "contact", "transaction", "landing", "home"],
    defaultNS: "common",
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: CHAVE_IDIOMA,
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  });

export default i18n;

/**
 * Mantem <html lang> em sincronia com o idioma escolhido.
 *
 * Nao e detalhe cosmetico: leitor de tela usa esse atributo para escolher a
 * FONETICA. Com o valor errado, "Transferencia" e "Saldo disponivel" sao
 * lidos com pronuncia inglesa — e o index.html vinha com lang="en" enquanto
 * o fallback do app e pt-BR.
 *
 * Aplicado tambem agora, na carga, e nao so no evento: o idioma inicial vem
 * do localStorage ou do navegador e ja pode ser diferente do que esta no
 * HTML antes de qualquer troca.
 */
function sincronizarLang(idioma: string): void {
  document.documentElement.lang = idioma;
}

i18n.on("languageChanged", sincronizarLang);
sincronizarLang(i18n.resolvedLanguage ?? "pt-BR");
