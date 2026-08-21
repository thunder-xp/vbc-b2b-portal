import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260821181248_partner_order_detail_read_model_v2.sql",
  ),
  "utf8",
).toLowerCase();
const detailPage = readFileSync(
  join(process.cwd(), "app/(partner)/cabinet/orders/[id]/page.tsx"),
  "utf8",
);
const intentLink = readFileSync(
  join(process.cwd(), "src/modules/orders/components/OrderDetailIntentLink.tsx"),
  "utf8",
);
const ordersPage = readFileSync(
  join(process.cwd(), "app/(partner)/cabinet/orders/page.tsx"),
  "utf8",
);

describe("partner order detail v2 read model", () => {
  it("uses one bounded, permission-protected local aggregate", () => {
    expect(migration).toContain("get_partner_order_detail_v2");
    expect(migration).toContain("get_effective_company_permissions(target.company_id)");
    expect(migration).toContain("'orders.view' = any(effective_permissions)");
    expect(migration).toContain("limit p_event_limit");
    expect(migration).toContain("limit p_document_limit");
    expect(migration).toContain("order_link.order_history_id = target.id");
    expect(migration).toContain("item.order_history_id = target.id");
    expect(migration).toContain("event.order_history_id = target.id");
    expect(migration).toContain("set search_path = public");
    expect(migration).toContain("set row_security = off");
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated");
  });

  it("keeps historical values separate from current catalog references", () => {
    expect(migration).toContain("'items'");
    expect(migration).toContain("'portal_snapshot'");
    expect(migration).toContain("'products'");
    expect(migration).toContain("'catalog.view' = any(effective_permissions)");
    expect(migration).toContain("product.is_active and product.is_visible");
    expect(migration).not.toContain("http");
    expect(migration).not.toContain("one-c");
  });

  it("does not launch a second document-context query from the page", () => {
    expect(detailPage).toContain("documents={order.documents}");
    expect(detailPage).not.toContain("listOrderDocumentsAction");
  });

  it("prefetches only an intended order detail target", () => {
    expect(ordersPage).toContain("<OrderDetailIntentLink");
    expect(intentLink).toContain("setTimeout(() =>");
    expect(intentLink).toContain("}, 100);");
    expect(intentLink).toContain("onFocus={() => setIntentPrefetch(true)}");
    expect(intentLink).toContain("prefetch={intentPrefetch}");
  });
});
