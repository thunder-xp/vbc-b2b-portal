import { describe, expect, it } from "vitest";

import { safeRelativeAuthRedirect } from "../redirects";

describe("auth redirect boundary", () => {
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", ""])("rejects %s", (value) => {
    expect(safeRelativeAuthRedirect(value)).toBeNull();
  });

  it.each(["/cabinet", "/agent", "/admin", "/auth/invitations/abcdefghijklmnopqrstuvwxyz"])("accepts bounded same-origin path %s", (value) => {
    expect(safeRelativeAuthRedirect(value)).toBe(value);
  });
});
