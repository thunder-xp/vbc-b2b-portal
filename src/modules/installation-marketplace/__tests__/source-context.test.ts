import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const productPage=readFileSync(resolve("app/products/[slug]/page.tsx"),"utf8");
const createPage=readFileSync(resolve("app/account/(private)/installations/new/page.tsx"),"utf8");

describe("Installation Marketplace source context",()=>{
  it("carries a canonical product slug and verifies it against the public product id",()=>{
    expect(productPage).toContain("productSlug=${encodeURIComponent(product.slug)}");
    expect(createPage).toContain("product.id!==query.productId");
    expect(createPage).toContain("product.calculatorEligible");
  });

  it("shows governed product or customer-owned order context before submission",()=>{
    expect(createPage).toContain("Выбранное оборудование");
    expect(createPage).toContain("Выбранный заказ");
    expect(createPage).toContain("orderDetail(context.account,query.orderId)");
  });
});
