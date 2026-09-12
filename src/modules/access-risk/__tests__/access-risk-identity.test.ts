import { describe, expect, it } from "vitest";

import { normalizeNetworkPrefix } from "../services/access-risk-identity";

describe("access risk network privacy", () => {
  it("coarsens IPv4 to /24", () => {
    expect(normalizeNetworkPrefix("203.0.113.42")).toBe("203.0.113.0/24");
  });

  it("coarsens IPv6 to /64", () => {
    expect(normalizeNetworkPrefix("2001:db8:abcd:12::77")).toBe("2001:0db8:abcd:0012::/64");
  });

  it("rejects non-address input", () => {
    expect(normalizeNetworkPrefix("not-an-address")).toBeNull();
  });
});
