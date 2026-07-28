import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MerchandisingEditorialPreview } from "../MerchandisingEditorialPreview";

describe("MerchandisingEditorialPreview", () => {
  it("renders saved curated products without partner commercial actions", () => {
    render(<MerchandisingEditorialPreview preview={{
      sections: [{
        labelCode: "TOP",
        products: [{
          id: "11111111-1111-4111-8111-111111111111",
          sku: "400669",
          name: "DH-P5D-5F-PV",
          slug: "dh-p5d-5f-pv",
          imageUrl: null,
          brandName: "Dahua",
          categoryName: "Камеры",
          stockState: "in_stock",
          priority: 100,
        }],
      }],
    }} />);

    expect(screen.getByText("Популярные товары")).toBeInTheDocument();
    expect(screen.getByText("DH-P5D-5F-PV")).toBeInTheDocument();
    expect(screen.getByText("Редакционный режим, только чтение")).toBeInTheDocument();
    expect(screen.queryByText(/цена/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a professional empty state", () => {
    render(<MerchandisingEditorialPreview preview={{ sections: [] }} />);
    expect(screen.getByText(
      "В опубликованной витрине пока нет товаров",
    )).toBeInTheDocument();
  });
});
