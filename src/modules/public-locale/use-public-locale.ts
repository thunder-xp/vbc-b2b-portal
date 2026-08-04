"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  DEFAULT_PUBLIC_LOCALE,
  PUBLIC_LOCALE_STORAGE_KEY,
  readPublicLocale,
  type PublicLocale,
} from "./public-locale";

export function usePublicLocale() {
  const locale = useSyncExternalStore(
    subscribeToLocale,
    getLocaleSnapshot,
    getServerLocaleSnapshot,
  );
  const isLocaleReady = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydratedSnapshot,
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((nextLocale: PublicLocale) => {
    window.localStorage.setItem(PUBLIC_LOCALE_STORAGE_KEY, nextLocale);
    window.dispatchEvent(new Event(PUBLIC_LOCALE_CHANGE_EVENT));
  }, []);

  return { locale, setLocale, isLocaleReady };
}

const PUBLIC_LOCALE_CHANGE_EVENT = "novotech-public-locale-change";

function subscribeToLocale(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(PUBLIC_LOCALE_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(PUBLIC_LOCALE_CHANGE_EVENT, onStoreChange);
  };
}

function getLocaleSnapshot(): PublicLocale {
  return readPublicLocale(window.localStorage);
}

function getServerLocaleSnapshot(): PublicLocale {
  return DEFAULT_PUBLIC_LOCALE;
}

function subscribeToHydration(): () => void {
  return () => undefined;
}

function getHydratedSnapshot(): boolean {
  return true;
}

function getServerHydratedSnapshot(): boolean {
  return false;
}
