import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CartPage from "../page";

vi.mock("server-only", () => ({}));
vi.mock("next/image", () => ({ default: ({ alt, src }: { alt: string; src: string }) => <span aria-label={alt || undefined} data-src={src} role={alt ? "img" : "presentation"} /> }));
vi.mock("@/src/modules/orders/actions", () => ({ getCartAction: vi.fn().mockResolvedValue({ success: true, data: { id: "cart-1", positionCount: 1, totalUnitCount: 2, total: "$20.00", submitting: false, lines: [{ id: "line-1", productId: "product-1", slug: "camera", productName: "Camera", sku: "400001", imageUrl: null, quantity: 2, partnerUnitPrice: "$10.00", partnerLineTotal: "$20.00", availableStock: 3, nearestArrivalDate: null, nearestArrivalQuantity: null }] } }) }));
vi.mock("@/src/modules/orders/components/CartItemActions", () => ({ CartItemActions: () => <button type="button">Actions</button> }));
vi.mock("@/src/modules/orders/components/OrderSubmitForm", () => ({ OrderSubmitForm: () => <button type="button">Submit</button> }));
vi.mock("@/src/modules/estimates/components/CreateEstimateFromCartButton", () => ({ CreateEstimateFromCartButton: () => null }));
vi.mock("@/src/modules/purchasing-lists/components", () => ({ SaveAsPurchasingListButton: () => null }));

describe("cart product rows", () => {
  it("renders a fixed thumbnail before product identity without changing totals", async () => {
    render(await CartPage());
    const thumbnail = screen.getByTestId("product-line-thumbnail");
    const product = screen.getByRole("link", { name: "Camera" });
    expect(thumbnail.compareDocumentPosition(product) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText("$20.00")).toHaveLength(2);
    expect(thumbnail.parentElement).toHaveClass("grid-cols-[3.5rem_minmax(0,1fr)]");
  });
});
