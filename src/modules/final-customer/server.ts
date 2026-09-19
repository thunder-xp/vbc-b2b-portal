import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { resolveCustomerAccessForUser } from "@/src/modules/auth/access-context";
import { canonicalMoldovaE164 } from "@/src/modules/final-customer-auth/auth-phone";
import { createRetailPaymentService } from "@/src/modules/payments/server";

import { SupabaseFinalCustomerRepository } from "./supabase.repository";
import { FinalCustomerAccessError, FinalCustomerAccountService, FinalCustomerAuthenticationError } from "./service";

export function createFinalCustomerService() {
  return new FinalCustomerAccountService(
    new SupabaseFinalCustomerRepository(),
    createRetailPaymentService(),
  );
}

export async function getFinalCustomerContext() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  const verifiedPhone = user?.phone ? canonicalMoldovaE164(user.phone) : null;
  if (error || !user || !verifiedPhone || !user.phone_confirmed_at) throw new FinalCustomerAuthenticationError();
  const access = await resolveCustomerAccessForUser(user.id);
  if (access.status !== "AVAILABLE") throw new FinalCustomerAccessError(access.status);
  const account = await createFinalCustomerService().findAuthenticatedAccount(user.id);
  if (!account) throw new FinalCustomerAccessError("NOT_ACTIVE");
  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const resolvedName = account.displayName ?? await new SupabaseFinalCustomerRepository().findDisplayName(account.customerIdentityId);
  return {
    account,
    verifiedPhone,
    displayName: resolvedName,
    aal: assurance?.currentLevel ?? null,
  } as const;
}
