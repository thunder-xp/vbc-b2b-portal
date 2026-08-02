import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(file), "utf8");

describe("partner mobile touch targets", () => {
  it("keeps product tabs, shell controls, and cart actions at least 44px high", () => {
    const productDetail = read("src/modules/catalog/components/ProductDetail.tsx");
    const partnerHeader = read("src/modules/partner-cabinet/components/PartnerHeader.tsx");
    const cartPage = read("app/(partner)/cabinet/cart/page.tsx");
    const purchasingList = read(
      "src/modules/purchasing-lists/components/SaveAsPurchasingListButton.tsx",
    );

    expect(productDetail).toContain("inline-flex min-h-11 items-center border-b-2");
    expect(partnerHeader).toContain("h-11 w-11 shrink-0");
    expect(partnerHeader).toContain('className="h-11 w-full');
    expect(cartPage).toContain("[&_button]:min-h-11 [&_input]:min-h-11");
    expect(purchasingList).toContain("inline-flex min-h-11 items-center");
  });
});
