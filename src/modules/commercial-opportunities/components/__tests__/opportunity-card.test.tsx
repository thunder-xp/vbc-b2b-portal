import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CommercialOpportunity } from "../../types";
import { PartnerLocaleProvider } from "../../../partner-locale";
import { OpportunityCard } from "../OpportunityCard";

const { addToCartActionMock, routerRefresh } = vi.hoisted(() => ({
  addToCartActionMock: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: routerRefresh }) }));
vi.mock("../../actions", () => ({ dismissCommercialOpportunityAction: vi.fn() }));
vi.mock("../../../orders/actions/cart.actions", () => ({ addToCartAction: addToCartActionMock }));
vi.mock("../../../behavior-analytics/components/BehaviorViewEvent", () => ({ recordBehaviorInteraction: vi.fn() }));

const base: CommercialOpportunity = {
  id: "7f243182-f24b-4f0a-a4b0-f8b291564dc9", type: "repeat_purchase_available", priority: 60,
  reasonCode: "repeat_purchase", reasonMetadata: { purchaseCount: 4, lastPurchasedAt: "2026-07-20T00:00:00Z", typicalQuantity: 2, daysSinceLastPurchase: 32, typicalIntervalDays: 30 },
  secondaryReasons: ["relevant_merchandising"], fingerprint: "a".repeat(64), firstDetectedAt: "2026-07-31T00:00:00Z", lastConfirmedAt: "2026-07-31T00:00:00Z", sourceType: "product", sourceId: "product-1",
  product: { id: "product-1", sku: "400123", name: "Camera", slug: "camera", imageUrl: null, categoryName: "Cameras", partnerPrice: { amount: 97.44, currency: "USD" }, retailPrice: { amount: 2399, currency: "MDL" }, availableQuantity: 12, expectedArrivalDate: null, expectedArrivalQuantity: null }, template: null,
};

const related: CommercialOpportunity = {
  ...base,
  type: "related_product",
  priority: 55,
  reasonCode: "related_to_regular_purchase",
  reasonMetadata: {
    sourceProductId: "source-product-1",
    sourceProductSku: "400198",
    sourceProductName: "DH-IPC-HFW2531SP-S-0280B-S2",
    sourcePurchaseCount: 4,
    relationCoOrderCount: 12,
  },
  fingerprint: "b".repeat(64),
  sourceId: "source-product-1",
};

describe("OpportunityCard", () => {
  beforeEach(() => {
    addToCartActionMock.mockReset();
    routerRefresh.mockReset();
  });

  it("explains relevance and keeps the canonical primary action", () => {
    render(<OpportunityCard opportunity={base} />);
    expect(screen.getByText("Вы покупаете регулярно")).toBeInTheDocument();
    expect(screen.getByText("Последняя покупка — 32 дня назад. Обычно: 2 шт.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В подборку" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Не показывать/ })).toBeInTheDocument();
  });

  it("renders only the permitted price serialized by the server", () => {
    const retailOnly = { ...base, product: { ...base.product!, partnerPrice: null } };
    render(<OpportunityCard opportunity={retailOnly} />);
    expect(screen.queryByText("Розничная цена")).not.toBeInTheDocument();
    expect(screen.queryByText("Ваша цена")).not.toBeInTheDocument();
    expect(screen.getByText("Цена уточняется")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "В подборку" })).not.toBeInTheDocument();
  });

  it("uses natural Romanian repeat language and a controlled quantity suggestion", () => {
    render(<PartnerLocaleProvider locale="ro"><OpportunityCard locale="ro" opportunity={base} /></PartnerLocaleProvider>);
    expect(screen.getByText("Cumpărați regulat")).toBeInTheDocument();
    expect(screen.getByText("Ultima achiziție — acum 32 de zile. De obicei: 2 buc.")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Cantitatea produsului" })).toHaveValue(2);
  });

  it("explains a related target factually in Russian and defaults quantity to one", () => {
    render(<OpportunityCard opportunity={related} />);
    expect(screen.getByText("Дополняющий товар")).toBeInTheDocument();
    expect(screen.getByText("Подобран как дополнение к DH-IPC-HFW2531SP-S-0280B-S2: 4 подтверждённых закупок компанией.")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Количество товара" })).toHaveValue(1);
    expect(screen.getByText("Ваша цена")).toBeInTheDocument();
    expect(screen.queryByText("Розничная цена")).not.toBeInTheDocument();
  });

  it("uses equally factual Romanian related-product wording", () => {
    render(<PartnerLocaleProvider locale="ro"><OpportunityCard locale="ro" opportunity={related} /></PartnerLocaleProvider>);
    expect(screen.getByText("Produs complementar")).toBeInTheDocument();
    expect(screen.getByText("Selectat ca produs complementar pentru DH-IPC-HFW2531SP-S-0280B-S2: 4 comenzi confirmate ale companiei.")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Cantitatea produsului" })).toHaveValue(1);
  });

  it("adds a governed related product to the shared working selection without a server mutation", async () => {
    const added = vi.fn();
    window.addEventListener("novotech:live-selection-add", added);
    const user = userEvent.setup();
    render(<OpportunityCard opportunity={related} />);

    await user.click(screen.getByRole("button", { name: "В подборку" }));

    expect(added).toHaveBeenCalledOnce();
    expect((added.mock.calls[0]?.[0] as CustomEvent).detail).toMatchObject({ product: { id: related.product!.id }, quantity: 1 });
    expect(addToCartActionMock).not.toHaveBeenCalled();
    expect(routerRefresh).not.toHaveBeenCalled();
    expect(screen.getByText("В подборке")).toBeInTheDocument();
    window.removeEventListener("novotech:live-selection-add", added);
  });

  it("keeps an existing Cart line visible while allowing it into a separate working selection", () => {
    render(<OpportunityCard opportunity={{ ...base, product: { ...base.product!, alreadyInCart: true } }} />);
    expect(screen.getByText("Уже в корзине")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В подборку" })).toBeInTheDocument();
  });

  it("does not offer an unavailable repeat product as an actionable purchase", () => {
    render(<OpportunityCard opportunity={{ ...base, product: { ...base.product!, availableQuantity: 0 } }} />);
    expect(screen.queryByRole("button", { name: "В подборку" })).not.toBeInTheDocument();
  });

  it("shows low stock as factual availability context", () => {
    render(<OpportunityCard opportunity={{ ...base, product: { ...base.product!, availableQuantity: 3 } }} />);
    expect(screen.getByText("Мало: 3 шт.")).toBeInTheDocument();
  });

  it("renders confirmed arrival without relying on color", () => {
    render(<OpportunityCard opportunity={{ ...base, type: "relevant_product_arrival_confirmed", reasonCode: "confirmed_arrival", reasonMetadata: { expectedDate: "2026-08-17", expectedQuantity: 140 }, product: { ...base.product!, availableQuantity: 0, expectedArrivalDate: "2026-08-17", expectedArrivalQuantity: 140 } }} />);
    expect(screen.getByText(/Поступление 140 шт/)).toBeInTheDocument();
    expect(screen.getByText("Поступление")).toBeInTheDocument();
  });

  it("renders template readiness as a separate actionable opportunity", () => {
    render(<OpportunityCard opportunity={{ ...base, product: null, template: { id: "template-1", name: "Monthly CCTV" }, type: "purchase_template_ready", reasonCode: "template_fully_ready", reasonMetadata: { itemCount: 8 }, sourceType: "purchase_template", sourceId: "template-1" }} />);
    expect(screen.getByText("Все 8 позиций шаблона доступны.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Проверить шаблон/ })).toHaveAttribute("href", "/cabinet/purchase-templates/template-1");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders the canonical medium thumbnail from the product reference", () => {
    render(<OpportunityCard opportunity={{
      ...base,
      product: {
        ...base.product!,
        reference: {
          productId: "product-1",
          slug: "camera",
          sku: "400123",
          name: "Camera",
          thumbnail: "/products/camera.jpg",
          thumbnailFit: "contain",
          publicationState: "published",
        },
      },
    }} />);
    expect(screen.getByRole("img", { name: "Camera, 400123" })).toHaveAttribute("src", expect.stringContaining("camera.jpg"));
    expect(screen.getByRole("img", { name: "Camera, 400123" })).toHaveAttribute("data-product-thumbnail", "md");
  });

  it("uses the controlled placeholder for an unmapped product image", () => {
    render(<OpportunityCard opportunity={base} />);
    expect(screen.getByRole("img", { name: "Camera, 400123" })).toHaveAttribute("src", expect.stringContaining("/product-placeholder.svg"));
  });
});
