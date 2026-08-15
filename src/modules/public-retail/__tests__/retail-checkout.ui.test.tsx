import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PublicRetailCheckoutForm } from "../components/PublicRetailCheckoutForm";
import type { PublicRetailCheckoutDto } from "../types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../actions/retail-checkout.actions", () => ({ createPublicRetailOrderAction: vi.fn() }));

const checkout: PublicRetailCheckoutDto = {
  cartRevision: 2, publicationId: "10000000-0000-4000-8000-000000000001", eligible: true,
  blockingReason: null, priceChanged: false, fingerprint: "a".repeat(64),
  selectedVariant: "economy", installationRequired: true,
  installationOptions: { regions: [{ code: "MD-C", name: "Chișinău" }], providers: [] }, commercialOffer: null,
  lines: [{ publicProductId: "20000000-0000-4000-8000-000000000001", bundleId: "30000000-0000-4000-8000-000000000001", source: "cctv_calculator", commercialGroup: "equipment", slug: "camera", sku: "CAM-1", name: "Camera", imageUrl: null, quantity: 2, unitCode: "piece", unitPrice: 100, lineTotal: 200, currency: "MDL", vatPresentation: "included", availability: "unknown", priceChanged: false, missing: false }],
  bundles: [{ id: "30000000-0000-4000-8000-000000000001", source: "cctv_calculator", installationIntent: { cameraInstallation: true, cableLaying: false, commissioning: false, remoteViewing: false } }],
  totals: { equipment: 200, materials: 0, installation: 50, equipmentDiscount: 0, total: 250, currency: "MDL", vatPresentation: "included" },
};

describe("PublicRetailCheckoutForm", () => {
  it("renders an accessible Russian guest checkout without fake payment", () => {
    render(<PublicRetailCheckoutForm checkout={checkout} locale="ru" />);
    expect(screen.getByLabelText("Имя и фамилия")).toBeRequired();
    expect(screen.getByLabelText("Телефон")).toHaveAttribute("inputmode", "tel");
    expect(screen.getByText("Кто выполнит монтаж?")).toBeInTheDocument();
    expect(screen.getByText("Монтаж и настройка")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Подтвердить заказ" })).toBeEnabled();
    expect(screen.queryByText(/MAIB|Оплатить/)).not.toBeInTheDocument();
  });

  it("renders Romanian labels and keeps installation address collapsed by default", () => {
    render(<PublicRetailCheckoutForm checkout={checkout} locale="ro" />);
    expect(screen.getByLabelText("Nume și prenume")).toBeRequired();
    expect(screen.getByLabelText("Adresa instalării coincide cu adresa de livrare")).toBeChecked();
    expect(screen.getByRole("button", { name: "Confirmă comanda" })).toBeEnabled();
  });
});
