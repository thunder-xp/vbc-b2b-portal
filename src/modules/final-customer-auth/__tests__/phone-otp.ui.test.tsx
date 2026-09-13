import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PhoneOtpForm } from "../components";
import * as client from "../phone-otp.client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../phone-otp.client", async () => {
  const actual = await vi.importActual<typeof import("../phone-otp.client")>("../phone-otp.client");
  return { ...actual, requestPhoneOtp: vi.fn(), verifyPhoneOtp: vi.fn() };
});

describe("Final Customer phone OTP UI", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses one accessible mobile OTP input with autocomplete and paste-friendly semantics", async () => {
    vi.mocked(client.requestPhoneOtp).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PhoneOtpForm locale="ru" />);
    await user.type(screen.getByRole("textbox", { name: "Телефон" }), "69123456");
    await user.click(screen.getByRole("button", { name: "Получить код" }));
    const input = await screen.findByRole("textbox", { name: "Код подтверждения" });
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("maxlength", "6");
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });
});
