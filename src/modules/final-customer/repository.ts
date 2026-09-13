import type { FinalCustomerAccount, FinalCustomerOrderSummary } from "./types";

export interface FinalCustomerRepository {
  findAccountByAuthUser(authUserId: string): Promise<FinalCustomerAccount | null>;
  createAccount(input: Readonly<{
    authUserId: string;
    customerIdentityId: string | null;
    resolutionStatus: "MATCHED" | "NEW" | "AMBIGUOUS" | "CONFLICT";
  }>): Promise<FinalCustomerAccount>;
  findDisplayName(customerIdentityId: string | null): Promise<string | null>;
  listOrders(customerIdentityId: string | null, limit: number): Promise<FinalCustomerOrderSummary[]>;
  updateProfile(accountId: string, displayName: string | null, email: string | null): Promise<void>;
}
