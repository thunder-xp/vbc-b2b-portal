import { describe, expect, it } from "vitest";

import { canonicalMoldovaE164 } from "../auth-phone";

describe("canonicalMoldovaE164", () => {
  it.each([
    ["068718675", "+37368718675"],
    ["68718675", "+37368718675"],
    ["37368718675", "+37368718675"],
    ["+37368718675", "+37368718675"],
    ["0037368718675", "+37368718675"],
    ["0 687 18 675", "+37368718675"],
  ])("normalizes %s once", (input, expected) => {
    expect(canonicalMoldovaE164(input)).toBe(expected);
    expect(canonicalMoldovaE164(expected)).toBe(expected);
  });

  it.each(["+37337368718675", "+3736871867", "0037337368718675", "abcdefgh", "+34668718675"])(
    "rejects invalid input %s",
    (input) => expect(canonicalMoldovaE164(input)).toBeNull(),
  );
});
