import { describe, expect, it } from "vitest";

import {
  DEFAULT_PUBLIC_LOCALE,
  PUBLIC_LOCALE_STORAGE_KEY,
  isPublicLocale,
  readPublicLocale,
} from "../public-locale";

describe("public locale", () => {
  it("keeps the landing locale storage contract", () => {
    expect(PUBLIC_LOCALE_STORAGE_KEY).toBe("novotech-landing-locale");
    expect(DEFAULT_PUBLIC_LOCALE).toBe("ru");
  });

  it.each(["ru", "ro"])("accepts supported locale %s", (locale) => {
    expect(isPublicLocale(locale)).toBe(true);
    expect(readPublicLocale({ getItem: () => locale })).toBe(locale);
  });

  it.each([null, "", "en", "RO", "invalid"])(
    "falls back to Russian for invalid value %s",
    (locale) => {
      expect(isPublicLocale(locale)).toBe(false);
      expect(readPublicLocale({ getItem: () => locale })).toBe("ru");
    },
  );
});
