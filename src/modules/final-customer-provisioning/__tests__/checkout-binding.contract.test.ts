import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const action = readFileSync(resolve(process.cwd(), "src/modules/public-retail/actions/retail-checkout.actions.ts"), "utf8");
const server = readFileSync(resolve(process.cwd(), "src/modules/final-customer-provisioning/server.ts"), "utf8");

describe("authenticated Retail checkout ownership binding", () => {
  it("does not create a legacy account while preparing checkout", () => {
    expect(action).not.toContain("getFinalCustomerContext");
    expect(action).toContain("getVerifiedRetailOwner");
    expect(action).toContain("bindRetailOrderToVerifiedOwner(access.hash, verifiedOwner)");
  });

  it("derives ownership only from a verified server-side Auth session", () => {
    expect(server).toContain("supabase.auth.getUser()");
    expect(server).toContain("user.phone_confirmed_at");
    expect(server).toContain("hashCustomerIdentityKey(\"PHONE\", verifiedPhone, true)");
    expect(server).toContain("createAdminClient().rpc(\"bind_retail_order_authenticated_owner_v1\"");
    expect(server).toContain("p_auth_user_id: owner.authUserId");
  });
});
