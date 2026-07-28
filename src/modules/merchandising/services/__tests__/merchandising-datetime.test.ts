import { describe, expect, it } from "vitest";

import { localDateTimeToUtc } from "../merchandising-datetime";

describe("merchandising datetime conversion", () => {
  it("converts a browser-local value to UTC without a silent shift", () => {
    expect(localDateTimeToUtc("2026-07-28T21:00", -180)).toBe(
      "2026-07-28T18:00:00.000Z",
    );
  });

  it("rejects invalid local dates", () => {
    expect(localDateTimeToUtc("2026-02-31T21:00", -120)).toBeNull();
    expect(localDateTimeToUtc("not-a-date", -120)).toBeNull();
  });
});
