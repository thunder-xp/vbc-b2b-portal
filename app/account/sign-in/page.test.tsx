import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";

import FinalCustomerSignInPage from "./page";

vi.mock("@/src/modules/final-customer/locale", () => ({
  getFinalCustomerLocale: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

describe("Final Customer sign-in locale", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["ru", "Личный кабинет", "Получить код"],
    ["ro", "Cont personal", "Primește codul"],
  ] as const)("renders the governed %s locale on first response", async (locale, title, submit) => {
    vi.mocked(getFinalCustomerLocale).mockResolvedValue(locale);

    render(await FinalCustomerSignInPage());

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: submit })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "NSD" })).toHaveAttribute("href", `/?lang=${locale}`);
  });
});
