import { describe, expect, it } from "vitest";

import { fromCampaignDateTimeInput, toCampaignDateTimeInput } from "../../campaign-datetime";

describe("campaign date-time round trip", () => {
  it("preserves the stored instant independently of the browser timezone", () => {
    expect(toCampaignDateTimeInput("2026-09-25T07:00:00+00:00")).toBe("2026-09-25T07:00");
    expect(fromCampaignDateTimeInput("2026-09-25T07:00")).toBe("2026-09-25T07:00:00.000Z");
  });

  it("rejects malformed local controls", () => {
    expect(() => fromCampaignDateTimeInput("2026-09-25")).toThrow("Invalid campaign date-time input.");
  });
});
