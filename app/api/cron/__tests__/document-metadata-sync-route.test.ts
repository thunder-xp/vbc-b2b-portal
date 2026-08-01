import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve("app/api/cron/document-metadata-sync/route.ts"),
  "utf8",
);

describe("document metadata synchronization cron route", () => {
  it("awaits the shared cron authorization result before running the service", () => {
    expect(route).toContain("(await authorizeCronRequest(request)).authorized");
    expect(route.indexOf("authorizeCronRequest")).toBeLessThan(
      route.indexOf("createDocumentMetadataSyncService().run"),
    );
  });

  it("keeps synchronization bounded and responses private", () => {
    expect(route).toContain("createDocumentMetadataSyncService().run(20)");
    expect(route).toContain('"Cache-Control": "no-store"');
  });
});
