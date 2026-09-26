import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({
  confirmAgentRewardPayoutAction: vi.fn(),
}));

import { PayoutConfirmationForm } from "../PayoutConfirmationForm";

describe("PayoutConfirmationForm", () => {
  it("shows the authoritative amount, evidence field, and explicit confirmation", () => {
    render(<PayoutConfirmationForm amountLabel="333,13 MDL" expectedUpdatedAt="2026-09-26T05:00:00Z" idempotencyKey="11000000-0000-4000-8000-000000000003" saleLinkId="11000000-0000-4000-8000-000000000001"/>);
    expect(screen.getAllByText(/333,13 MDL/)).toHaveLength(2);
    expect(screen.getByLabelText("Номер платёжного документа / референс")).toBeRequired();
    expect(screen.getByRole("checkbox")).toBeRequired();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("keeps the submit control unavailable while the required confirmation is unchecked", () => {
    render(<PayoutConfirmationForm amountLabel="333,13 MDL" expectedUpdatedAt="2026-09-26T05:00:00Z" idempotencyKey="11000000-0000-4000-8000-000000000003" saleLinkId="11000000-0000-4000-8000-000000000001"/>);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });
});
