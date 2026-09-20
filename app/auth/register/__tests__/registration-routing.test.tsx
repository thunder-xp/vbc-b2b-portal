import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/src/modules/auth/actions/auth.actions", () => ({
  registerAgentAction: vi.fn(async () => ({ error: null })),
  registerInstallerAction: vi.fn(async () => ({ error: null })),
}));

import LegacyProfessionalRegisterPage from "../page";
import ProfessionalRegisterPage from "../[intent]/page";

describe("route-owned professional registration intent", () => {
  it.each([
    [{}, "/become-partner?lang=ru"],
    [{ intent: "unexpected", lang: "ro" }, "/become-partner?lang=ro"],
  ])("rejects a missing or invalid compatibility intent", async (query, target) => {
    await expect(LegacyProfessionalRegisterPage({ searchParams: Promise.resolve(query) }))
      .rejects.toThrow(`NEXT_REDIRECT:${target}`);
  });

  it("redirects a valid compatibility intent to the immutable route and drops a mismatched continuation", async () => {
    await expect(LegacyProfessionalRegisterPage({
      searchParams: Promise.resolve({ intent: "agent", lang: "ru", next: "/onboarding/profile" }),
    })).rejects.toThrow("NEXT_REDIRECT:/auth/register/agent?lang=ru");
  });

  it.each([
    ["agent", "Регистрация коммерческого агента", "участие в агентской программе Novotech"],
    ["installer", "Регистрация профессионального инсталлятора", "профессиональное сотрудничество с Novotech"],
  ] as const)("renders %s as an explicit program", async (intent, title, description) => {
    render(await ProfessionalRegisterPage({
      params: Promise.resolve({ intent }),
      searchParams: Promise.resolve({ lang: "ru" }),
    }));

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(description))).toBeInTheDocument();
    expect(screen.getByLabelText(/Форма работы/)).toBeInTheDocument();
    expect(document.querySelector('input[name="intent"]')).not.toBeInTheDocument();
  });
});
