import { describe, expect, it } from "vitest";

import {
  ONE_C_ZERO_GUID,
  oneCGuidSchema,
  parseOptionalOneCGuid,
  parseRequiredOneCGuid,
} from "../one-c-guid";

describe("oneCGuidSchema", () => {
  it("accepts RFC-compatible and non-RFC 1C GUID shapes", () => {
    expect(oneCGuidSchema.safeParse("11111111-1111-4111-8111-111111111111").success).toBe(true);
    expect(oneCGuidSchema.safeParse("18e36ea4-f68f-11f0-4393-7239d3b7bd5c").success).toBe(true);
  });

  it("rejects malformed references while accepting the zero GUID syntax", () => {
    expect(oneCGuidSchema.safeParse("18e36ea4-f68f-11f0-4393-7239d3b7bd5").success).toBe(false);
    expect(oneCGuidSchema.safeParse(ONE_C_ZERO_GUID).success).toBe(true);
  });

  it("maps optional zero or invalid references to null and rejects zero required references", () => {
    expect(parseOptionalOneCGuid(ONE_C_ZERO_GUID)).toBeNull();
    expect(parseOptionalOneCGuid("")).toBeNull();
    expect(parseOptionalOneCGuid("not-a-guid")).toBeNull();
    expect(parseRequiredOneCGuid(ONE_C_ZERO_GUID)).toBeNull();
  });
});
