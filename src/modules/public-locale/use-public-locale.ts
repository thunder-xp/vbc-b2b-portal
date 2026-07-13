"use client";

import { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_PUBLIC_LOCALE,
  PUBLIC_LOCALE_STORAGE_KEY,
  readPublicLocale,
  type PublicLocale,
} from "./public-locale";

export function usePublicLocale() {
  const [locale, setLocaleState] = useState<PublicLocale>(DEFAULT_PUBLIC_LOCALE);
  const [isLocaleReady, setIsLocaleReady] = useState(false);

  useEffect(() => {
    const storedLocale = readPublicLocale(window.localStorage);
    setLocaleState(storedLocale);
    document.documentElement.lang = storedLocale;
    setIsLocaleReady(true);
  }, []);

  const setLocale = useCallback((nextLocale: PublicLocale) => {
    setLocaleState(nextLocale);
    window.localStorage.setItem(PUBLIC_LOCALE_STORAGE_KEY, nextLocale);
    document.documentElement.lang = nextLocale;
  }, []);

  return { locale, setLocale, isLocaleReady };
}
