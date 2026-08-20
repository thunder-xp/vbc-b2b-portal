import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductCard } from "../../../catalog/components/ProductCard";
import { resolveWorkspaceCapabilities } from "../../../partner-cabinet/services";

const product = { id: "44444444-4444-4444-8444-444444444444", sku: "100", name: "Camera", slug: "camera", shortDescription: null, imageUrl: null, brand: null, category: null, keyCharacteristics: [], datasheet: null };

describe("warehouse arrival product presentation", () => {
  it("uses the canonical card with a contextual replenishment badge", () => {
    render(<ProductCard capabilities={resolveWorkspaceCapabilities(new Set(["catalog.view"])).productCard} contextBadge="Пополнение" product={product} />);
    expect(screen.getByText("Пополнение")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Camera" })[0]).toHaveAttribute("href", "/cabinet/catalog/camera");
  });
});
