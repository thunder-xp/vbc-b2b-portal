import { describe, expect, it } from "vitest";

import {
  CANONICAL_VERCEL_PROJECT,
  validateVercelProjectLink,
} from "../../../scripts/verify-vercel-project.mjs";

describe("Vercel project governance", () => {
  it("accepts the canonical project linkage", () => {
    expect(validateVercelProjectLink(CANONICAL_VERCEL_PROJECT)).toEqual({
      ok: true,
      mismatches: [],
    });
  });

  it("rejects a feature-named project linkage", () => {
    const result = validateVercelProjectLink({
      ...CANONICAL_VERCEL_PROJECT,
      projectId: "prj_duplicate",
      projectName: "vbc-b2b-portal-feature",
    });

    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual([
      "projectId must be prj_VrGa1zrCDn9BS0nmAvfsTY1FySeA",
      "projectName must be vbc-b2b-portal",
    ]);
  });
});
