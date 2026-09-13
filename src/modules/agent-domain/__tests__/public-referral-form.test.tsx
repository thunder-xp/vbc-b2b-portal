import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({
  captureAgentReferralAction: vi.fn(),
}));

import { PublicReferralForm } from "../components/PublicReferralForm";

describe("public Agent referral form", () => {
  it("renders the complete bounded lead-capture contract", () => {
    render(<PublicReferralForm token="opaque-token" />);

    expect(screen.getByRole("textbox", { name: "Имя / название" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "Тип объекта" })).toHaveAttribute("maxlength", "120");
    expect(screen.getByRole("textbox", { name: "Срок проекта" })).toHaveAttribute("maxlength", "160");
    expect(screen.getByRole("textbox", { name: "Что требуется" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "Краткое описание объекта" })).toHaveAttribute("maxlength", "1500");
    expect(screen.getByRole("checkbox")).toBeRequired();
    expect(screen.getByRole("button", { name: "Отправить заявку" })).toHaveClass("min-h-11");
  });
});
