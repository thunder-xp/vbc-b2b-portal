import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../actions/failed-registration-purge.actions", () => ({
  purgeFailedRegistrationAction: vi.fn(),
}));

import { FailedRegistrationPurgeControl } from "../FailedRegistrationPurgeControl";

describe("FailedRegistrationPurgeControl", () => {
  it("requires an explicit exact-email confirmation and displays the target identity", () => {
    render(
      <FailedRegistrationPurgeControl
        readiness={{
          eligible: true,
          state: "ready",
          requestId: "20000000-0000-4000-8000-000000000001",
          userId: "10000000-0000-4000-8000-000000000001",
          email: "livecam.benidorm@gmail.com",
          applicationName: "Benidorm Dream",
          receiptId: null,
          blockers: [],
          counts: {},
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Сбросить регистрацию" }));

    expect(screen.getByText("livecam.benidorm@gmail.com")).toBeInTheDocument();
    expect(screen.getByText("Benidorm Dream")).toBeInTheDocument();
    expect(screen.getByLabelText("Введите точный email для подтверждения")).toBeRequired();
    expect(screen.getByRole("checkbox")).toBeRequired();
    expect(screen.getByRole("button", { name: "Удалить регистрацию" })).toBeInTheDocument();
  });

  it("renders no destructive control for an ineligible registration", () => {
    const { container } = render(
      <FailedRegistrationPurgeControl
        readiness={{
          eligible: false,
          state: "blocked",
          requestId: "20000000-0000-4000-8000-000000000001",
          userId: "10000000-0000-4000-8000-000000000001",
          email: "blocked@example.test",
          applicationName: "Blocked company",
          receiptId: null,
          blockers: [{ code: "PROTECTED_MEMBERSHIP", count: 1 }],
          counts: {},
        }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
