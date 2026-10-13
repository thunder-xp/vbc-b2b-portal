import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BusinessPhoneEnrollmentCard } from "../components/BusinessPhoneEnrollmentCard";
import { BusinessPhoneEnrollmentLink } from "../components/BusinessPhoneEnrollmentLink";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../enrollment.actions", () => ({ startBusinessPhoneEnrollmentAction: vi.fn(), resendBusinessPhoneEnrollmentAction: vi.fn(), verifyBusinessPhoneEnrollmentAction: vi.fn() }));
afterEach(cleanup);

describe("Business phone enrollment presentation", () => {
  it("shows the masked Agent enrollment target rather than missing-phone copy", () => {
    render(<BusinessPhoneEnrollmentCard initialState="VERIFICATION_REQUIRED" locale="ru" nextPath="/agent/profile" targetPhone="+37369256733" />);
    expect(screen.getByText("+373 ** *** 33")).toBeInTheDocument();
    expect(screen.queryByText("+37369256733")).not.toBeInTheDocument();
    expect(screen.queryByText("Номер телефона не указан")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отправить SMS-код" })).toBeEnabled();
  });

  it("offers the governed Agent enrollment link for a phone requiring verification", () => {
    render(<BusinessPhoneEnrollmentLink locale="ru" returnTo="/agent/profile" state="VERIFICATION_REQUIRED" />);
    expect(screen.getByText("Требуется подтверждение")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Подтвердить номер" })).toHaveAttribute("href", "/auth/business-phone-enrollment?lang=ru&next=%2Fagent%2Fprofile");
  });

  it("presents an actionable reconciliation state with no SMS button", () => {
    render(<BusinessPhoneEnrollmentCard initialState="CONFLICT" locale="ru" nextPath="/agent/profile" targetPhone={null} />);
    expect(screen.getByRole("heading", { name: "Номер требует сверки" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Отправить SMS-код" })).not.toBeInTheDocument();
    expect(screen.getByText(/Обратитесь в Novotech для сверки/)).toBeInTheDocument();
    expect(screen.queryByText(/commercial_agents|user_profiles/)).not.toBeInTheDocument();
  });
});
