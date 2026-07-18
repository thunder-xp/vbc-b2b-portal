import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { saveEstimateProposalSettingsAction } from "../../actions/proposal.actions";
import type { CustomerProposalDto, ProposalSettings, ProposalTemplate } from "../../types";
import { ProposalControls } from "../ProposalControls";
import { ProposalDocument } from "../ProposalDocument";

vi.mock("../../actions/proposal.actions", () => ({ saveEstimateProposalSettingsAction: vi.fn(), generateEstimateProposalPdfAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const settings: ProposalSettings = { title: "Коммерческое предложение", introduction: "Предложение", deliveryTerms: "Поставка", paymentTerms: "Оплата", warrantyTerms: "Гарантия", validityText: "14 дней", installationNotes: "", exclusions: "", customerNote: "", footerNote: "", showProductImages: true, showSku: true, showUnitPrice: true, showLineDiscount: true, showSectionSubtotals: true, showVatBreakdown: true, showPartnerLogo: true };
const template: ProposalTemplate = { id: "template-1", companyId: null, key: "equipment_supply", name: "Поставка оборудования", configuration: settings, isSystem: true };

describe("proposal UI", () => {
  it("renders customer-facing totals and never internal commercial data", () => {
    render(<ProposalDocument proposal={proposal()} />);
    expect(screen.getByText("Коммерческое предложение")).toBeInTheDocument();
    expect(screen.getByText("Камера 1")).toBeInTheDocument();
    expect(screen.getByText("ИТОГО")).toBeInTheDocument();
    expect(screen.queryByText(/себестоимость|маржа|1C|permission/i)).not.toBeInTheDocument();
  });

  it("applies a template and saves all settings in one action", async () => {
    const user = userEvent.setup();
    vi.mocked(saveEstimateProposalSettingsAction).mockResolvedValue({ success: true, data: { revision: 4 }, message: "Сохранено", errorCode: null });
    render(<ProposalControls estimateId="estimate-1" initialSettings={settings} revision={3} selectedTemplateId={template.id} templates={[template]} />);
    await user.click(screen.getByRole("button", { name: "Настройки" }));
    expect(screen.getByRole("combobox", { name: "Шаблон" })).toHaveValue(template.id);
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(saveEstimateProposalSettingsAction).toHaveBeenCalledTimes(1);
    expect(saveEstimateProposalSettingsAction).toHaveBeenCalledWith("estimate-1", expect.objectContaining({ expectedRevision: 3, templateId: template.id, settings: expect.objectContaining({ showSku: true }) }));
  });

  it("server-renders long previews without client calculation", () => {
    for (const count of [1, 20, 100, 300]) {
      const started = performance.now(); const html = renderToStaticMarkup(<ProposalDocument proposal={proposal(count)} />);
      if (process.env.BENCHMARK_PROPOSAL_PREVIEW) console.info({ lineCount: count, durationMs: Number((performance.now() - started).toFixed(1)), htmlBytes: Buffer.byteLength(html) });
      expect(html).toContain(`Камера ${count}`); expect(performance.now() - started).toBeLessThan(2_000);
    }
  });
});

function proposal(lineCount = 1): CustomerProposalDto { const total = lineCount * 100; return { schemaVersion: "2026-07-16-v1", estimateNumber: "KP-1", generatedForDate: "2026-07-16", customerName: "Customer", projectName: "Site", currencyCode: "USD", settings, branding: { companyName: "Partner SRL", legalName: null, contactName: null, phone: null, email: null, website: null, fiscalInformation: null, address: null, logoUrl: null }, sections: [{ name: "Оборудование", subtotal: total, lines: Array.from({ length: lineCount }, (_, index) => ({ position: index + 1, description: `Камера ${index + 1}`, sku: `400${index}`, imageUrl: null, quantity: 1, unitLabel: "шт.", unitPrice: 100, lineDiscountPercent: 0, lineTotal: 100 })) }], charges: [], totals: { subtotal: total, discounts: 0, charges: 0, totalExcludingVat: total, vat: 0, total } }; }
