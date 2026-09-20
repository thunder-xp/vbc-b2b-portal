import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  resend: vi.fn(),
  start: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../../enrollment.actions", () => ({
  startBusinessPhoneEnrollmentAction: mocks.start,
  resendBusinessPhoneEnrollmentAction: mocks.resend,
  verifyBusinessPhoneEnrollmentAction: mocks.verify,
}));

import { BusinessPhoneEnrollmentCard } from "../BusinessPhoneEnrollmentCard";
import { BusinessPhoneEnrollmentLink } from "../BusinessPhoneEnrollmentLink";

describe("BusinessPhoneEnrollmentCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the saved Profile phone and exposes no editable phone target", async () => {
    mocks.start.mockResolvedValue({ ok: true, step: "OTP", challengeId: "11111111-1111-4111-8111-111111111111", maskedPhone: "+373 ** *** 20" });
    render(
      <BusinessPhoneEnrollmentCard
        initialState="VERIFICATION_REQUIRED"
        locale="ru"
        nextPath="/cabinet/profile"
        targetPhone="+37369982220"
      />,
    );

    expect(screen.getByText("+37369982220")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /телефон/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Отправить SMS-код" }));
    expect(mocks.start).toHaveBeenCalledWith();
    expect(await screen.findByRole("heading", { name: "Код подтверждения" })).toBeInTheDocument();
  });

  it("renders the phone_change OTP step and recomputes state after confirmation", async () => {
    mocks.start.mockResolvedValue({ ok: true, step: "OTP", challengeId: "11111111-1111-4111-8111-111111111111", maskedPhone: "+373 ** *** 20" });
    mocks.verify.mockResolvedValue({ ok: true, step: "CONFIRMED" });
    render(
      <BusinessPhoneEnrollmentCard
        initialState="VERIFICATION_REQUIRED"
        locale="ro"
        nextPath="/cabinet/profile"
        targetPhone="+37369982220"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Trimite codul SMS" }));
    await userEvent.type(screen.getByLabelText("Codul din SMS"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Confirmă" }));
    expect(mocks.verify).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "123456");
    expect(await screen.findByText("Numărul este deja confirmat.")).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("shows safe CONFLICT and NOT_SET states without a send action", () => {
    const { unmount } = render(
      <BusinessPhoneEnrollmentCard initialState="CONFLICT" locale="ru" nextPath="/cabinet/profile" targetPhone="+37369982220" />,
    );
    expect(screen.getByRole("heading", { name: "Номер связан с другой учётной записью" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /отправить/i })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/@|user id/i);

    unmount();
    render(
      <BusinessPhoneEnrollmentCard initialState="NOT_SET" locale="ro" nextPath="/cabinet/profile" targetPhone={null} />,
    );
    expect(screen.getByRole("heading", { name: "Numărul de telefon nu este indicat" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /trimite/i })).not.toBeInTheDocument();
  });

  it("renders an already VERIFIED phone without a send action", () => {
    render(
      <BusinessPhoneEnrollmentCard initialState="VERIFIED" locale="ru" nextPath="/cabinet/profile" targetPhone="+37360433603" />,
    );
    expect(screen.getByRole("heading", { name: "Номер уже подтверждён." })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /отправить/i })).not.toBeInTheDocument();
  });
});

describe("BusinessPhoneEnrollmentLink", () => {
  it("renders explicit RU VERIFIED status with a disabled action", () => {
    render(<BusinessPhoneEnrollmentLink locale="ru" returnTo="/cabinet/profile" state="VERIFIED" />);
    expect(screen.getByText("✓ Номер подтверждён")).toBeInTheDocument();
    expect(screen.getByText("Этот номер используется для быстрого входа по SMS.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Номер подтверждён" })).toBeDisabled();
  });

  it("renders an enabled RO verification action only for VERIFICATION_REQUIRED", () => {
    render(<BusinessPhoneEnrollmentLink locale="ro" returnTo="/cabinet/profile" state="VERIFICATION_REQUIRED" />);
    expect(screen.getByText("Este necesară confirmarea")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Confirmați numărul" })).toHaveAttribute(
      "href",
      "/auth/business-phone-enrollment?lang=ro&next=%2Fcabinet%2Fprofile",
    );
  });
});
