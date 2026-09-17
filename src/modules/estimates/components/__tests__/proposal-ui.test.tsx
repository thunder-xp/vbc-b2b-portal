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

const settings: ProposalSettings = { senderDisplayName: "", title: "Коммерческое предложение", introduction: "Предложение", deliveryTerms: "Поставка", paymentTerms: "Оплата", warrantyTerms: "Гарантия", validityText: "14 дней", installationNotes: "", exclusions: "", customerNote: "", footerNote: "", showProductImages: true, showSku: true, showProductName: true, showDescription: true, showHeadingGreeting: true, showUnitPrice: true, showLineDiscount: true, showSectionSubtotals: true, showVatBreakdown: true, showPartnerLogo: true };
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
    expect(screen.queryByText("Customer")).not.toBeInTheDocument();
    expect(screen.queryByText("Site")).not.toBeInTheDocument();
    expect(screen.getByText("Предложение")).toBeInTheDocument();
    expect(screen.queryByText("шт.")).not.toBeInTheDocument();
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

  it("restarts presentation numbering in every section only for new proposal snapshots", () => {
    const value = proposal();
    const line = value.sections[0].lines[0];
    const sections = [
      { name: "Оборудование", subtotal: 100, lines: [{ ...line, position: 7 }] },
      { name: "Монтажные материалы", subtotal: 100, lines: [{ ...line, position: 8, description: "Кабель" }] },
    ];
    const { unmount } = render(<ProposalDocument proposal={{ ...value, schemaVersion: "2026-08-12-v4", sections }} />);
    expect(screen.getAllByRole("table").map((table) => within(table).getAllByRole("row")[1].children[0]?.textContent)).toEqual(["1", "1"]);
    unmount();
    render(<ProposalDocument proposal={{ ...value, schemaVersion: "2026-08-11-v3", sections }} />);
    expect(screen.getAllByRole("table").map((table) => within(table).getAllByRole("row")[1].children[0]?.textContent)).toEqual(["7", "8"]);
  });

  it("continues to obey the existing proposal discount visibility setting", () => {
    const value = proposal();
    const { unmount } = render(<ProposalDocument proposal={value} />);
    expect(screen.getAllByText("Скидка").length).toBeGreaterThan(0);
    unmount();
    render(<ProposalDocument proposal={{ ...value, settings: { ...value.settings, showLineDiscount: false } }} />);
    expect(screen.queryByText("Скидка")).not.toBeInTheDocument();
  });

  it("keeps the required commercial columns and bounds long descriptions", () => {
    const value = proposal();
    const longDescription = `Камера ${"с подробным техническим описанием ".repeat(20)}`;
    render(<ProposalDocument proposal={{ ...value, sections: [{ ...value.sections[0], lines: [{ ...value.sections[0].lines[0], description: longDescription }] }] }} />);

    for (const label of ["Оборудование", "Кол-во", "Цена за ед.", "Сумма"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText("Ед.")).not.toBeInTheDocument();
    expect(screen.queryByText("шт.")).not.toBeInTheDocument();
    const description = screen.getByText((content) => content.startsWith("Камера с подробным") && content.endsWith("…")).parentElement;
    expect(description).not.toBeNull();
    expect(description!).toHaveAttribute("title", expect.stringContaining("SKU 4000 Dahua DHI-ARA11 Камера с подробным"));
    expect(description!.textContent?.endsWith("…")).toBe(true);
    expect(description!.textContent!.length).toBeLessThanOrEqual(270);
    expect(description!.querySelector("p:last-child")).toHaveClass("font-normal", "text-[9px]", "leading-[1.2]", "[text-align:justify]");
  });

  it("keeps SKU and immutable product name together above the compact description", () => {
    render(<ProposalDocument proposal={proposal()} />);
    const sku = screen.getByText("SKU 4000");
    const name = screen.getByText("Dahua DHI-ARA11");
    const description = screen.getByText("Камера 1");
    expect(sku).toHaveClass("text-[9px]", "font-normal", "text-zinc-500");
    expect(name).toHaveClass("text-[11px]", "font-medium", "text-zinc-950");
    expect(description).toHaveClass("text-[9px]", "font-normal");
    expect(name.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelectorAll("colgroup col")).toHaveLength(6);
    expect(document.querySelectorAll("colgroup col")[1]).not.toHaveAttribute("class");
  });

  it.each([
    ["showSku", "SKU 4000"],
    ["showProductName", "Dahua DHI-ARA11"],
    ["showDescription", "Камера 1"],
    ["showHeadingGreeting", "Коммерческое предложение"],
  ] as const)("removes %s content instead of visually hiding it", (setting, text) => {
    const value = proposal();
    render(<ProposalDocument proposal={{ ...value, settings: { ...value.settings, [setting]: false } }} />);
    expect(screen.queryByText(text)).not.toBeInTheDocument();
  });

  it("supports independent SKU, name, and description combinations without reserved identity blocks", () => {
    const value = proposal();
    const { rerender } = render(<ProposalDocument proposal={{ ...value, settings: { ...value.settings, showSku: false } }} />);
    expect(screen.queryByText("SKU 4000")).not.toBeInTheDocument();
    expect(screen.getByText("Dahua DHI-ARA11")).toBeInTheDocument();
    expect(screen.getByText("Камера 1")).toBeInTheDocument();

    rerender(<ProposalDocument proposal={{ ...value, settings: { ...value.settings, showProductName: false, showDescription: false } }} />);
    expect(screen.getByText("SKU 4000")).toBeInTheDocument();
    expect(screen.queryByText("Dahua DHI-ARA11")).not.toBeInTheDocument();
    expect(screen.queryByText("Камера 1")).not.toBeInTheDocument();

    rerender(<ProposalDocument proposal={{ ...value, settings: { ...value.settings, showSku: false, showProductName: false, showDescription: false, showProductImages: false } }} />);
    expect(screen.queryByText(/SKU 4000|Dahua DHI-ARA11|Камера 1/)).not.toBeInTheDocument();
  });

  it("keeps new display options enabled for historical immutable snapshots that predate them", () => {
    const value = proposal();
    const historicalSettings = { ...value.settings };
    delete historicalSettings.showProductName;
    delete historicalSettings.showDescription;
    delete historicalSettings.showHeadingGreeting;
    render(<ProposalDocument proposal={{ ...value, schemaVersion: "2026-09-14-v5", settings: historicalSettings }} />);
    expect(screen.getByText("Коммерческое предложение")).toBeInTheDocument();
    expect(screen.getByText("Dahua DHI-ARA11")).toBeInTheDocument();
    expect(screen.getByText("Камера 1")).toBeInTheDocument();
  });

  it("does not render a subtotal for an empty section and renders compact contact details", () => {
    const value = proposal();
    render(<ProposalDocument proposal={{ ...value, branding: { ...value.branding, phone: "+373 22 00 00 00", email: "sales@example.md" }, sections: [{ name: "Монтажные работы", subtotal: 0, lines: [] }] }} />);

    expect(screen.queryByText(/Итого за монтажные работы/)).not.toBeInTheDocument();
    expect(screen.getByText("Ответственный: Ivan Partner")).toBeInTheDocument();
    expect(screen.getAllByText("+373 22 00 00 00")).toHaveLength(1);
    expect(screen.getAllByText("sales@example.md")).toHaveLength(1);
  });

  it("uses a sender override without replacing or duplicating the responsible contact", () => {
    const value = proposal();
    const { rerender } = render(<ProposalDocument proposal={{ ...value, settings: { ...value.settings, senderDisplayName: "XVISION" } }} />);

    expect(screen.getByText("XVISION")).toBeInTheDocument();
    expect(screen.queryByText("Partner SRL")).not.toBeInTheDocument();
    expect(screen.getByText("Ответственный: Ivan Partner")).toBeInTheDocument();

    rerender(<ProposalDocument proposal={{ ...value, settings: { ...value.settings, senderDisplayName: "" } }} />);
    expect(screen.getByText("Partner SRL")).toBeInTheDocument();
    expect(screen.queryByText("XVISION")).not.toBeInTheDocument();
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
    render(<ProposalControls automaticSenderDisplayName="Partner SRL" estimateId="estimate-1" initialSettings={settings} revision={3} selectedTemplateId={template.id} templates={[template]} />);
    await user.click(screen.getByRole("button", { name: "Настройки оформления" }));
    expect(screen.getByRole("combobox", { name: "Шаблон" })).toHaveValue(template.id);
    const senderName = screen.getByRole("textbox", { name: "Название компании / бренда" });
    expect(senderName).toHaveAttribute("maxlength", "120");
    expect(senderName).toHaveAttribute("placeholder", "Partner SRL");
    await user.type(senderName, "XVISION");
    expect(screen.queryByRole("textbox", { name: "Условия поставки" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Условия оплаты" })).not.toBeInTheDocument();
    for (const label of ["Артикулы SKU", "Наименование", "Описание", "Заголовок и обращение"]) expect(screen.getByRole("checkbox", { name: label })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(saveEstimateProposalSettingsAction).toHaveBeenCalledTimes(1);
    expect(saveEstimateProposalSettingsAction).toHaveBeenCalledWith("estimate-1", expect.objectContaining({ expectedRevision: 3, templateId: template.id, settings: expect.objectContaining({ senderDisplayName: "XVISION", showSku: true }) }));
  });

  it("preserves the proposal-specific sender override when another template is selected", async () => {
    const user = userEvent.setup();
    vi.mocked(saveEstimateProposalSettingsAction).mockResolvedValue({ success: true, data: { revision: 4 }, message: "Сохранено", errorCode: null });
    const secondTemplate: ProposalTemplate = { ...template, id: "template-2", key: "service_offer", name: "Сервисное предложение", configuration: { ...settings, title: "Сервис" } };
    render(<ProposalControls automaticSenderDisplayName="Partner SRL" estimateId="estimate-1" initialSettings={{ ...settings, senderDisplayName: "XVISION" }} revision={3} selectedTemplateId={template.id} templates={[template, secondTemplate]} />);
    await user.click(screen.getByRole("button", { name: "Настройки оформления" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Шаблон" }), secondTemplate.id);
    expect(screen.getByRole("textbox", { name: "Название компании / бренда" })).toHaveValue("XVISION");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(saveEstimateProposalSettingsAction).toHaveBeenCalledWith("estimate-1", expect.objectContaining({ templateId: secondTemplate.id, settings: expect.objectContaining({ senderDisplayName: "XVISION", title: "Сервис" }) }));
  });

  it("server-renders long previews without client calculation", () => {
    for (const count of [3, 20, 40]) {
      const started = performance.now(); const html = renderToStaticMarkup(<ProposalDocument proposal={proposal(count)} />);
      if (process.env.BENCHMARK_PROPOSAL_PREVIEW) console.info({ lineCount: count, durationMs: Number((performance.now() - started).toFixed(1)), htmlBytes: Buffer.byteLength(html) });
      expect(html).toContain(`Камера ${count}`); expect(performance.now() - started).toBeLessThan(2_000);
    }
  });
});

function proposal(lineCount = 1): CustomerProposalDto { const total = lineCount * 100; return { schemaVersion: "2026-09-15-v6", estimateNumber: "KP-1", generatedForDate: "2026-07-16", validUntilDate: "2026-07-30", customerName: "Customer", projectName: "Site", currencyCode: "USD", vatMode: "separate", vatRatePercent: 20, settings, branding: { companyName: "Partner SRL", legalName: null, contactName: "Ivan Partner", phone: null, email: null, website: null, fiscalInformation: null, address: null, logoUrl: null }, sections: [{ name: "Оборудование", subtotal: total, lines: Array.from({ length: lineCount }, (_, index) => ({ position: index + 1, lineType: "product", description: `Камера ${index + 1}`, sku: `400${index}`, productName: index === 0 ? "Dahua DHI-ARA11" : `Dahua Model ${index + 1}`, imageUrl: null, quantity: 1, unitLabel: "шт.", unitPrice: 100, lineDiscountPercent: 0, lineTotal: 100 })) }], charges: [], totals: { subtotal: total, discounts: 0, charges: 0, totalExcludingVat: total, vat: 0, total } }; }
