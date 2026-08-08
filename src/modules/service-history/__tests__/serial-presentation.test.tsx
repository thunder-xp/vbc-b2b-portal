import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OneCServiceHistorySummary } from "../components";
import type { OneCServiceHistoryDetail } from "../types";

describe("service-history serial presentation", () => {
  it("keeps the partner serial masked and renders canonical warranty states safely", () => {
    render(<OneCServiceHistorySummary detail={detail({ maskedSerial: "ABC***XYZ", warrantyState: "covered" })} />);
    expect(screen.getByText("ABC***XYZ")).toBeInTheDocument();
    expect(screen.getByText("Гарантия подтверждена")).toBeInTheDocument();
  });

  it("allows an authorized internal projection to render the revealed serial", () => {
    render(<OneCServiceHistorySummary detail={detail({ serial: "ABC123XYZ", maskedSerial: "ABC***XYZ", warrantyState: "sale_confirmed_review_required" })} />);
    expect(screen.getByText("ABC123XYZ")).toBeInTheDocument();
    expect(screen.queryByText("ABC***XYZ")).not.toBeInTheDocument();
    expect(screen.getByText("Требует проверки")).toBeInTheDocument();
  });
});

function detail(overrides: Partial<OneCServiceHistoryDetail>): OneCServiceHistoryDetail {
  return {
    id: "11111111-1111-1111-1111-111111111111", number: "NSUU-000229", date: "2026-07-24T10:00:00Z",
    status: "accepted", sourceStatus: "Принят в ремонт", product: { id: null, sku: "190023", name: "Test", imageUrl: null, href: null },
    maskedSerial: null, reportedFault: null, resolution: null, warrantyState: null, warrantyStartDate: null, warrantyEndDate: null,
    serviceCenter: null, updatedAt: "2026-08-08T08:30:00Z", events: [], ...overrides,
  };
}
