import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PartnerLanguageSwitch } from "../PartnerLanguageSwitch";
import { partnerText } from "../copy";
import { formatPartnerDateTime } from "../format";
import { isPartnerLocale, partnerLocaleTag } from "../locale";

const { setLocale } = vi.hoisted(() => ({ setLocale: vi.fn() }));
vi.mock("../actions", () => ({ setPartnerLocaleAction: (locale: string) => setLocale(locale) }));

describe("partner locale", () => {
  it("accepts only governed locales", () => {
    expect(isPartnerLocale("ru")).toBe(true);
    expect(isPartnerLocale("ro")).toBe(true);
    expect(isPartnerLocale("en")).toBe(false);
  });

  it("uses locale-aware formatter tags", () => {
    expect(partnerLocaleTag("ru")).toBe("ru-RU");
    expect(partnerLocaleTag("ro")).toBe("ro-RO");
  });

  it("formats date-times in the governed partner timezone", () => {
    expect(formatPartnerDateTime("2026-09-05T08:01:00Z", "ru")).toContain("11:01");
  });

  it("renders the inverse language and switches without constructing a route", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PartnerLanguageSwitch locale="ru" />);
    await user.click(screen.getByRole("button", { name: "Переключить интерфейс на румынский" }));
    expect(setLocale).toHaveBeenCalledWith("ro");

    rerender(<PartnerLanguageSwitch locale="ro" />);
    expect(screen.getByRole("button", { name: "Comută interfața în limba rusă" })).toHaveTextContent("RU");
  });

  it("respects an editor guard before changing locale", async () => {
    const user = userEvent.setup();
    setLocale.mockClear();
    const guard = (event: Event) => event.preventDefault();
    window.addEventListener("novotech:before-locale-change", guard);
    render(<PartnerLanguageSwitch locale="ru" />);
    await user.click(screen.getByRole("button", { name: "Переключить интерфейс на румынский" }));
    expect(setLocale).not.toHaveBeenCalled();
    window.removeEventListener("novotech:before-locale-change", guard);
  });

  it("keeps RU as the canonical fallback dictionary", () => {
    expect(partnerText("ru", "nav.catalog")).toBe("Каталог товаров");
    expect(partnerText("ro", "nav.catalog")).toBe("Catalog produse");
  });
});
