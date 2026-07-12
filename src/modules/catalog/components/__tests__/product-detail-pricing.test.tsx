import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductDetail } from "../ProductDetail";

vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("../ProductImageGallery", () => ({ ProductImageGallery: () => <div>Gallery</div> }));

describe("ProductDetail pricing", () => {
  it("uses the shared price labels while retaining useful attributes", () => {
    render(<ProductDetail commercialView={{ productId: "product-1", partnerPrice: { currencyCode: "USD", amount: 45.81, formattedAmount: "$45.81" }, retailPrice: { currencyCode: "MDL", amount: 39.2, formattedAmount: "39.20 MDL" }, stock: null, isDemoData: false }} product={product} />);
    expect(screen.getByText("ОПТОВАЯ")).toBeInTheDocument();
    expect(screen.getByText("РОЗНИЧНАЯ")).toBeInTheDocument();
    expect(screen.getByText("Resolution")).toBeInTheDocument();
    expect(screen.getByText("4 MPX")).toBeInTheDocument();
  });
});

const product = { id: "product-1", sku: "NV-100", name: "IP Camera", slug: "ip-camera", shortDescription: null, description: "Camera", imageUrl: null, brand: null, category: null, keyCharacteristics: [{ label: "Resolution", value: "4 MPX" }], datasheet: null, images: [], documents: [] };
