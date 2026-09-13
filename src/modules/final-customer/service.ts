import "server-only";

import type { User } from "@supabase/supabase-js";

import {
  CustomerIdentityResolutionService,
  SupabaseCustomerIdentityRepository,
} from "@/src/modules/customer-identity";
import { canonicalMoldovaE164 } from "@/src/modules/final-customer-auth/auth-phone";

import type { FinalCustomerRepository } from "./repository";
import type { FinalCustomerAccount } from "./types";

export class FinalCustomerAuthenticationError extends Error {
  constructor() {
    super("Final Customer authentication required.");
    this.name = "FinalCustomerAuthenticationError";
  }
}

export class FinalCustomerAccountService {
  constructor(
    private readonly repository: FinalCustomerRepository,
    private readonly identityResolver = new CustomerIdentityResolutionService(
      new SupabaseCustomerIdentityRepository(),
    ),
  ) {}

  async ensureAccount(user: User): Promise<FinalCustomerAccount> {
    const verifiedPhone = user.phone ? canonicalMoldovaE164(user.phone) : null;
    if (!user.id || !verifiedPhone || !user.phone_confirmed_at) {
      throw new FinalCustomerAuthenticationError();
    }
    const existing = await this.repository.findAccountByAuthUser(user.id);
    if (existing) return existing;

    const resolution = await this.identityResolver.resolve({
      customerType: "PERSON",
      phone: verifiedPhone,
      verifiedKeyTypes: ["PHONE"],
      createIfMissing: true,
      exposeCandidateIds: false,
    });
    return this.repository.createAccount({
      authUserId: user.id,
      customerIdentityId: resolution.customerIdentityId,
      resolutionStatus: resolution.status,
    });
  }

  async overview(account: FinalCustomerAccount) {
    const [resolvedName, orders] = await Promise.all([
      account.displayName ? Promise.resolve(account.displayName) : this.repository.findDisplayName(account.customerIdentityId),
      account.status === "ACTIVE" ? this.repository.listOrders(account.customerIdentityId, 5) : Promise.resolve([]),
    ]);
    return { displayName: resolvedName, orders, latestOrder: orders[0] ?? null };
  }

  listOrders(account: FinalCustomerAccount) {
    return account.status === "ACTIVE"
      ? this.repository.listOrders(account.customerIdentityId, 50)
      : Promise.resolve([]);
  }

  async updateProfile(account: FinalCustomerAccount, input: { displayName: string; email: string }) {
    const displayName = input.displayName.trim().replace(/\s+/g, " ") || null;
    const email = input.email.trim().toLowerCase() || null;
    if (displayName && (displayName.length < 2 || displayName.length > 160)) {
      throw new Error("INVALID_PROFILE");
    }
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw new Error("INVALID_PROFILE");
    }
    await this.repository.updateProfile(account.id, displayName, email);
  }
}
