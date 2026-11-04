"use client";
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import es from "./messages/es.json";
import en from "./messages/en.json";
export type MessageKey = keyof typeof es;
export type Locale = "es" | "en";
const dictionaries: Record<Locale, Record<MessageKey, string>> = { es, en };
const Context = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
}>({ locale: "es", setLocale: () => {}, t: (key) => es[key] });
let sessionLocale: Locale | undefined;
function readLocale(): Locale {
  if (sessionLocale) return sessionLocale;
  try {
    return localStorage.getItem("azra:locale") === "en" ? "en" : "es";
  } catch {
    return "es";
  }
}
function subscribeLocale(callback: () => void) {
  window.addEventListener("azra-locale", callback);
  return () => window.removeEventListener("azra-locale", callback);
}
export function LanguageProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, readLocale, () => "es" as Locale);
  useEffect(() => {
    document.documentElement.lang = locale === "es" ? "es-SV" : "en-US";
    return () => {
      document.documentElement.lang = "es-SV";
    };
  }, [locale]);
  function setLocale(value: Locale) {
    sessionLocale = value;
    try {
      localStorage.setItem("azra:locale", value);
    } catch {
      /* Session-only preference. */
    }
    window.dispatchEvent(new Event("azra-locale"));
  }
  return (
    <Context.Provider value={{ locale, setLocale, t: (key) => dictionaries[locale][key] }}>
      {children}
    </Context.Provider>
  );
}
export const useLanguage = () => useContext(Context);
