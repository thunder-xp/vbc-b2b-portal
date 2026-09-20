import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CommercialAgentApplication } from "../../types";
import { CommercialAgentApplicationForm } from "../CommercialAgentApplicationForm";

vi.mock("../../actions", () => ({
  submitCommercialAgentApplicationAction: vi.fn(async () => ({ success: false, message: null, application: null })),
}));

describe("CommercialAgentApplicationForm", () => {
  it("shows the bounded applicant fields and distinguishes required from optional", () => {
    render(<CommercialAgentApplicationForm application={application()} locale="ru" />);
    expect(screen.getByLabelText(/Имя \/ публичное название/)).toBeRequired();
    expect(screen.getByLabelText(/Формат работы/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Телефон/)).not.toBeRequired();
    expect(screen.getByLabelText(/Email для связи/)).not.toBeRequired();
    expect(screen.queryByText(/комисси|доход|выплат/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/compliance|membership|role assignment/i)).not.toBeInTheDocument();
  });

  it("shows Romanian clarification safely and allows resubmission", () => {
    render(<CommercialAgentApplicationForm application={application({
      status: "NEEDS_CLARIFICATION",
      applicantVisibleNote: "Indicați localitatea actuală.",
    })} locale="ro" />);
    expect(screen.getByText("Datele trebuie clarificate")).toBeInTheDocument();
    expect(screen.getByText("Indicați localitatea actuală.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trimite datele actualizate" })).toBeInTheDocument();
  });

  it("shows a compact human status instead of a raw enum", () => {
    render(<CommercialAgentApplicationForm application={application({ status: "SUBMITTED" })} locale="ru" />);
    expect(screen.getByRole("heading", { name: "Заявка отправлена на проверку" })).toBeInTheDocument();
    expect(screen.queryByText("SUBMITTED")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Отправить/ })).not.toBeInTheDocument();
  });
});

function application(overrides: Partial<CommercialAgentApplication> = {}): CommercialAgentApplication {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    applicantUserId: "11111111-1111-4111-8111-111111111111",
    status: "DRAFT",
    displayName: "Agent Name",
    phone: null,
    email: "agent@example.com",
    locality: null,
    profession: null,
    workplace: null,
    agentType: "INDIVIDUAL",
    legalName: null,
    applicantVisibleNote: null,
    submittedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    provisionedAgentId: null,
    revision: 1,
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    ...overrides,
  };
}
