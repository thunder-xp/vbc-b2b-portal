import { describe, expect, it } from "vitest";
import { activeNavigationKey } from "../active-navigation";

const items = [
  { key: "kits", href: "/cabinet/purchasing-lists" },
  { key: "favorites", href: "/cabinet/purchasing-lists?filter=favorites" },
  { key: "compare", href: "/cabinet/compare" },
];

describe("intentional active navigation matching", () => {
  it("gives query-defined views precedence regardless of order", () => {
    for (const entries of [items, [...items].reverse()]) {
      expect(activeNavigationKey("/cabinet/purchasing-lists", new URLSearchParams("page=2&filter=favorites"), entries)).toBe("favorites");
    }
  });
  it("preserves child routes but does not match sibling path prefixes", () => {
    expect(activeNavigationKey("/cabinet/purchasing-lists/kit-1", new URLSearchParams(), items)).toBe("kits");
    expect(activeNavigationKey("/cabinet/purchasing-lists-other", new URLSearchParams(), items)).toBeUndefined();
    expect(activeNavigationKey("/cabinet/comparison", new URLSearchParams(), items)).toBeUndefined();
  });
  it("selects a more specific child over its ancestor", () => {
    expect(activeNavigationKey("/cabinet/estimates/generator", new URLSearchParams(), [
      { key: "estimates", href: "/cabinet/estimates" },
      { key: "generator", href: "/cabinet/estimates/generator" },
    ])).toBe("generator");
  });
  it("does not activate a disabled or root ancestor route", () => {
    expect(activeNavigationKey("/cabinet/unknown", new URLSearchParams(), [
      { key: "root", href: "/cabinet" }, { key: "disabled", href: null },
    ])).toBeUndefined();
  });
});
