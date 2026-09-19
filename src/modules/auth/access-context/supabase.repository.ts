import "server-only";

import { z } from "zod";

import { createClient } from "@/src/lib/supabase/server";

import type { BusinessAccessRepository, CustomerAccessRepository } from "./service";
import type { BusinessContextType, CustomerAccountStatus } from "./types";

const contextSchema = z.object({
  type: z.enum(["PARTNER", "AGENT"]),
  contextId: z.uuid(),
  displayName: z.string().min(1).max(240),
  status: z.enum(["AVAILABLE", "PENDING", "BLOCKED"]),
  targetRoute: z.enum(["/cabinet", "/agent"]),
});

const resolutionSchema = z.object({
  contexts: z.array(contextSchema).max(50),
  preferredContext: contextSchema.nullable(),
});

export class SupabaseBusinessAccessRepository implements BusinessAccessRepository {
  async resolveOwn(authUserId: string) {
    void authUserId;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("resolve_own_business_access_contexts");
    if (error) throw new Error(`Business access resolution failed: ${error.code ?? "UNKNOWN"}`);
    return resolutionSchema.parse(data);
  }

  async selectOwn(type: BusinessContextType, contextId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("select_own_business_context", {
      p_context_type: type,
      p_context_id: contextId,
    });
    if (error) throw new Error(`Business context selection failed: ${error.code ?? "UNKNOWN"}`);
    return contextSchema.parse(data);
  }
}

export class SupabaseCustomerAccessRepository implements CustomerAccessRepository {
  async findOwnAccountStatus(authUserId: string): Promise<CustomerAccountStatus | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("customer_accounts")
      .select("status")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (error) throw new Error(`Customer access resolution failed: ${error.code ?? "UNKNOWN"}`);
    if (!data) return null;
    if (data.status === "ACTIVE" || data.status === "IDENTITY_REVIEW_REQUIRED" || data.status === "SUSPENDED") {
      return data.status;
    }
    throw new Error("Customer access resolution returned an invalid status.");
  }
}
