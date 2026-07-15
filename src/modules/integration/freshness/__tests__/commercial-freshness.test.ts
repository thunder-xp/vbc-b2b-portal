import { describe, expect, it } from "vitest";

import { evaluateFreshness } from "../commercial-freshness";

const NOW = Date.parse("2026-07-15T12:00:00Z");

describe("commercial freshness policy", () => {
  it.each([
    ["stock", 149, "fresh"],
    ["stock", 150, "aging"],
    ["stock", 301, "stale"],
    ["activeOrder", 29, "fresh"],
    ["activeOrder", 30, "aging"],
    ["activeOrder", 121, "stale"],
    ["price", 25 * 60, "fresh"],
    ["price", 26 * 60, "aging"],
    ["price", 36 * 60 + 1, "stale"],
  ] as const)("classifies %s at %s minutes as %s", (domain, ageMinutes, status) => {
    expect(evaluateFreshness(new Date(NOW - ageMinutes * 60_000).toISOString(), domain, "Данные", NOW).status).toBe(status);
  });

  it("returns a server-renderable stale notice without timers", () => {
    const result = evaluateFreshness("2026-07-15T05:00:00Z", "stock", "Остатки", NOW);
    expect(result.label).toContain("Остатки обновлены");
    expect(result.staleNotice).toContain("последние подтверждённые данные");
  });
});
