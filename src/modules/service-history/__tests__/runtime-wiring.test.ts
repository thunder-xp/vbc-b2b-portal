import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const partnerPage = read("app/(partner)/cabinet/service/page.tsx");
const detailPage = read("app/(partner)/cabinet/service/history/[id]/page.tsx");
const repository = read("src/modules/service-history/repository.ts");
const cron = read("app/api/cron/service-history/route.ts");
const dashboardRepository = read("src/modules/service-center/supabase.repository.ts");
const imageProjection = read("supabase/migrations/20260808233000_service_center_canonical_product_images.sql");

describe("1C service-history runtime wiring", () => {
  it("renders portal and 1C history through one bounded aggregate", () => {
    expect(partnerPage).toContain("listUnifiedServiceHistoryAction");
    expect(repository).toContain('"list_partner_service_history"');
    expect(partnerPage).not.toContain("OneCODataClient");
    expect(partnerPage).not.toContain("createAdminClient");
  });

  it("keeps imported details on a read-only partner-safe route", () => {
    expect(detailPage).toContain("getOneCServiceHistoryAction");
    expect(detailPage).not.toMatch(/action=|<form/);
  });

  it("runs 1C access only behind the authenticated bounded cron worker", () => {
    expect(cron).toContain("authorizeCronRequest");
    expect(cron).toContain("runBatch");
    expect(cron).toContain("runSerialEnrichmentBatch");
    expect(cron).toContain("maxDuration = 300");
  });

  it("uses the bounded dashboard projection without another dashboard block", () => {
    expect(dashboardRepository).toContain('"get_partner_service_dashboard_v2"');
  });

  it("resolves canonical product images in one bounded database aggregate", () => {
    expect(imageProjection).toContain("coalesce(p.image_source_url, p.image_url");
    expect(imageProjection).toContain("canonical_images as");
    expect(imageProjection).toContain("from paged");
    expect(imageProjection).toContain("catalog_product_images");
    expect(imageProjection).not.toContain("OneCODataClient");
    expect(imageProjection).not.toContain("Document_");
  });
});

function read(path: string) { return readFileSync(resolve(process.cwd(), path), "utf8"); }
