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
    ns: ["common", "auth", "errors", "account", "statement", "contact"],
    defaultNS: "common",
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: CHAVE_IDIOMA,
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
