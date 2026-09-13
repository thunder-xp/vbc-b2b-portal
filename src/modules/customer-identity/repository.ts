import type {
  CustomerExternalRefMatch,
  CustomerIdentityKind,
  HashedIdentityKey,
  IdentityKeyMatch,
} from "./types";

export interface CustomerIdentityRepository {
  findKeyMatches(keys: readonly HashedIdentityKey[]): Promise<IdentityKeyMatch[]>;
  findExternalRef(input: {
    system: string;
    entityType: string;
    externalId: string;
  }): Promise<CustomerExternalRefMatch | null>;
  createIdentity(input: {
    kind: CustomerIdentityKind;
    keys: readonly HashedIdentityKey[];
    external1cRef?: string | null;
  }): Promise<string>;
  recordReconciliation(input: {
    caseType: "AMBIGUOUS" | "CONFLICT";
    reasonCode: "MULTIPLE_MATCHES" | "IDENTIFIER_CONFLICT";
    candidateIds: readonly string[];
  }): Promise<void>;
}
