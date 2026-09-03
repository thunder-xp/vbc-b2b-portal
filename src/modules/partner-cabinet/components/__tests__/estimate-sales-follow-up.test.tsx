import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { WorkspaceHomeDto } from "../../services";
import { EstimateSalesSection } from "../OperationalDashboard";

type Opportunity = NonNullable<WorkspaceHomeDto["estimateSalesOpportunities"]>[number];

const base: Opportunity = {
  id: "awaiting_customer:version-1",
  type: "awaiting_customer",
  priority: 4,
  estimateId: "estimate-1",
  versionId: "version-1",
  estimateNumber: "KP-1",
  proposalName: "Office CCTV",
  customerName: "Client SRL",
  projectName: "Office",
  amount: 30696,
  currency: "MDL",
  waitingSince: "2026-09-01T10:00:00Z",
  validUntil: "2026-09-15T10:00:00Z",
  followUpState: "sent_opened_no_response",
  action: "resend",
  href: "/cabinet/estimates/estimate-1?proposalAction=resend&version=version-1#estimate-order-conversion",
};

describe("EstimateSalesSection follow-up context", () => {
  it("renders compact truthful opened and not-opened signals without delivery PII", () => {
    const { rerender } = render(<EstimateSalesSection items={[base]} locale="ru" />);
    expect(screen.getByText(/Клиент открыл предложение/)).toBeInTheDocument();
    expect(screen.getByText(/30.*696.*MDL/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Отправить повторно" })).toHaveAttribute("href", base.href);
    expect(document.body.textContent).not.toContain("client@example.com");

    rerender(<EstimateSalesSection items={[{ ...base, followUpState: "sent_not_opened" }]} locale="ru" />);
    expect(screen.getByText(/Предложение ещё не открыто/)).toBeInTheDocument();
  });

  it("renders Romanian follow-up and an honest expired update action", () => {
    render(<EstimateSalesSection items={[{ ...base, followUpState: "expired_sent", action: "update", validUntil: "2026-08-20T10:00:00Z", href: "/cabinet/estimates/estimate-1#estimate-order-conversion" }]} locale="ro" />);
    expect(screen.getByText(/Perioada de valabilitate a ofertei a expirat/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Actualizează oferta" })).toHaveAttribute("href", "/cabinet/estimates/estimate-1#estimate-order-conversion");
    expect(screen.queryByText(/valabilă până la/)).not.toBeInTheDocument();
  });
});
