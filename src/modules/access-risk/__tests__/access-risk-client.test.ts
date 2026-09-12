import { describe, expect, it } from "vitest";

import { toRouteFamily } from "../client/access-risk-telemetry";

describe("access risk route minimization", () => {
  it("drops dynamic identifiers and query strings", () => {
    expect(toRouteFamily("/cabinet/catalog/400448?tab=description")).toBe("/cabinet/catalog");
    expect(toRouteFamily("/cabinet/estimates/2ed79b61-37f5-4331-a7bb-4d4f7261ea30")).toBe("/cabinet/estimates");
  });

  it("does not accept a public route as detailed context", () => {
    expect(toRouteFamily("/catalog/private-product")).toBe("/cabinet");
  });
});
