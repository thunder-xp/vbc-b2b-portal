import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ExternalDemandAdminControls } from "../ExternalDemandAdminControls";

vi.mock("../../actions/demand.actions", () => ({ transitionExternalDemandAction: vi.fn(), curateExternalNomenclatureAction: vi.fn() }));

const detail = {
  item: { externalItemId: "11111111-1111-1111-1111-111111111111", manufacturer: "Ajax", model: "Hub", name: "Security hub", category: "Alarm", unit: "pcs" },
  requests: [{ id: "22222222-2222-2222-2222-222222222222", status: "new" as const, version: 1, companyName: "Partner", estimateId: "33333333-3333-3333-3333-333333333333", estimateNumber: "KP-1", estimateLifecycle: "sent", customerName: "Customer", industryCode: "retail", locality: "Chisinau", projectName: "Site", quantity: 2, unit: "pcs", requestedAt: "2026-08-08T10:00:00Z", responses: [] }],
  possibleDuplicates: [],
};

describe("external demand UI", () => {
  it("shows operational context and governed transitions without partner pricing", () => {
    render(<ExternalDemandAdminControls detail={detail} products={[{ id: "44444444-4444-4444-4444-444444444444", sku: "400691", name: "Hub 2" }]} />);
    expect(screen.getByText(/Partner · KP-1/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Товар Novotech" })).toBeInTheDocument();
    expect(screen.queryByText(/маржа|партнёрская цена|закупочная/i)).not.toBeInTheDocument();
  });
});
