import { render, screen, within } from "@testing-library/react";
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
    expect(screen.getByText("К оплате")).toBeInTheDocument();
    expect(screen.getByText("Итого без НДС")).toBeInTheDocument();
    expect(screen.getByText("НДС (20%)")).toBeInTheDocument();
    expect(screen.getByText(/Итого за оборудование:/)).toBeInTheDocument();
    expect(screen.getByText("Действительно до")).toBeInTheDocument();
    expect(screen.getByText("30 июля 2026 г.")).toBeInTheDocument();
    expect(screen.getByText("Ответственный: Ivan Partner")).toBeInTheDocument();
    expect(screen.queryByText("начисляется отдельно, 20%")).not.toBeInTheDocument();
    expect(screen.queryByText("Условия предложения")).not.toBeInTheDocument();
    expect(screen.queryByText("Поставка")).not.toBeInTheDocument();
    expect(screen.queryByText("Оплата")).not.toBeInTheDocument();
    expect(screen.queryByText(/себестоимость|маржа|1C|permission/i)).not.toBeInTheDocument();
  });

  it("places one product thumbnail column before description and leaves service lines image-free", () => {
    const value = proposal();
    const product = { ...value.sections[0].lines[0], lineType: "product" as const, imageUrl: "https://www.nsd.md/image.jpg" };
    const service = { ...product, position: 2, lineType: "service" as const, sku: null, imageUrl: null, description: "Монтаж" };
    render(<ProposalDocument proposal={{ ...value, sections: [{ ...value.sections[0], lines: [product, service] }] }} />);
    expect(screen.getAllByTestId("product-line-thumbnail")).toHaveLength(1);
    const description = screen.getByText("Камера 1");
    expect(screen.getByTestId("product-line-thumbnail").compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Монтаж")).toBeInTheDocument();
  });

  it("keeps customer prices visible in the compact mobile line layout", () => {
    render(<ProposalDocument proposal={proposal(3)} />);
    expect(screen.getByRole("table")).not.toHaveClass("min-w-[620px]");
    expect(screen.getAllByText("Количество")).toHaveLength(3);
    expect(screen.getAllByText("Цена за единицу")).toHaveLength(3);
    expect(screen.getByText("Цена за ед.")).toBeInTheDocument();
    expect(screen.getAllByText("Сумма")).toHaveLength(4);
  });

  it("keeps the required commercial columns and bounds long descriptions", () => {
    const value = proposal();
    const longDescription = `Камера ${"с подробным техническим описанием ".repeat(20)}`;
    render(<ProposalDocument proposal={{ ...value, sections: [{ ...value.sections[0], lines: [{ ...value.sections[0].lines[0], description: longDescription }] }] }} />);

    for (const label of ["№", "Код / модель", "Описание", "Ед.", "Кол-во", "Цена за ед.", "Сумма"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    const description = document.querySelector("p[title]");
    expect(description).not.toBeNull();
    expect(description!).toHaveAttribute("title", longDescription);
    expect(description!.textContent?.endsWith("…")).toBe(true);
    expect(description!.textContent!.length).toBeLessThanOrEqual(221);
  });

  it("does not render a subtotal for an empty section and renders compact contact details", () => {
    const value = proposal();
    render(<ProposalDocument proposal={{ ...value, branding: { ...value.branding, phone: "+373 22 00 00 00", email: "sales@example.md" }, sections: [{ name: "Монтажные работы", subtotal: 0, lines: [] }] }} />);

    expect(screen.queryByText(/Итого за монтажные работы/)).not.toBeInTheDocument();
    expect(screen.getByText("Ответственный: Ivan Partner")).toBeInTheDocument();
    expect(screen.getAllByText("+373 22 00 00 00")).toHaveLength(1);
    expect(screen.getAllByText("sales@example.md")).toHaveLength(1);
  });

  it("omits a zero VAT row when VAT does not apply", () => {
    const value = proposal();
    render(<ProposalDocument proposal={{ ...value, vatMode: "none", vatRatePercent: 0 }} />);
    const totals = screen.getByRole("region", { name: "Итоги предложения" });
    expect(within(totals).queryByText(/^НДС/)).not.toBeInTheDocument();
    expect(screen.queryByText("не применяется")).not.toBeInTheDocument();
  });

  it("applies a template and saves all settings in one action", async () => {
    const user = userEvent.setup();
    vi.mocked(saveEstimateProposalSettingsAction).mockResolvedValue({ success: true, data: { revision: 4 }, message: "Сохранено", errorCode: null });
    render(<ProposalControls estimateId="estimate-1" initialSettings={settings} revision={3} selectedTemplateId={template.id} templates={[template]} />);
    await user.click(screen.getByRole("button", { name: "Настройки оформления" }));
    expect(screen.getByRole("combobox", { name: "Шаблон" })).toHaveValue(template.id);
    expect(screen.queryByRole("textbox", { name: "Условия поставки" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Условия оплаты" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(saveEstimateProposalSettingsAction).toHaveBeenCalledTimes(1);
    expect(saveEstimateProposalSettingsAction).toHaveBeenCalledWith("estimate-1", expect.objectContaining({ expectedRevision: 3, templateId: template.id, settings: expect.objectContaining({ showSku: true }) }));
  });

  it("server-renders long previews without client calculation", () => {
    for (const count of [3, 20, 40]) {
      const started = performance.now(); const html = renderToStaticMarkup(<ProposalDocument proposal={proposal(count)} />);
      if (process.env.BENCHMARK_PROPOSAL_PREVIEW) console.info({ lineCount: count, durationMs: Number((performance.now() - started).toFixed(1)), htmlBytes: Buffer.byteLength(html) });
      expect(html).toContain(`Камера ${count}`); expect(performance.now() - started).toBeLessThan(2_000);
    }
  });
});

function proposal(lineCount = 1): CustomerProposalDto { const total = lineCount * 100; return { schemaVersion: "2026-08-08-v2", estimateNumber: "KP-1", generatedForDate: "2026-07-16", validUntilDate: "2026-07-30", customerName: "Customer", projectName: "Site", currencyCode: "USD", vatMode: "separate", vatRatePercent: 20, settings, branding: { companyName: "Partner SRL", legalName: null, contactName: "Ivan Partner", phone: null, email: null, website: null, fiscalInformation: null, address: null, logoUrl: null }, sections: [{ name: "Оборудование", subtotal: total, lines: Array.from({ length: lineCount }, (_, index) => ({ position: index + 1, lineType: "product", description: `Камера ${index + 1}`, sku: `400${index}`, imageUrl: null, quantity: 1, unitLabel: "шт.", unitPrice: 100, lineDiscountPercent: 0, lineTotal: 100 })) }], charges: [], totals: { subtotal: total, discounts: 0, charges: 0, totalExcludingVat: total, vat: 0, total } }; }
