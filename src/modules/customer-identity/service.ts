import type { CustomerIdentityRepository } from "./repository";
import { hashCustomerIdentityKey } from "./hmac";
import {
  normalizeCustomerEmail,
  normalizeCustomerLegalIdentifier,
  normalizeCustomerPhone,
} from "./normalization";
import type {
  CustomerIdentityKeyType,
  CustomerIdentityResolution,
  HashedIdentityKey,
  ResolveCustomerIdentityInput,
} from "./types";

export class CustomerIdentityResolutionService {
  constructor(private readonly repository: CustomerIdentityRepository) {}

  async resolve(input: ResolveCustomerIdentityInput): Promise<CustomerIdentityResolution> {
    const verified = new Set(input.verifiedKeyTypes ?? []);
    const keys = buildKeys(input, verified);
    const [matches, externalMatch] = await Promise.all([
      this.repository.findKeyMatches(keys),
      input.existing1cRef
        ? this.repository.findExternalRef({
            system: "1C",
            entityType: "COUNTERPARTY",
            externalId: input.existing1cRef.trim(),
          })
        : Promise.resolve(null),
    ]);

    const strongMatches = new Map<string, Set<string>>();
    if (externalMatch) addReason(strongMatches, externalMatch.customerIdentityId, "EXACT_1C_REF");
    for (const match of matches) {
      const requested = keys.find(
        (key) =>
          key.keyType === match.keyType &&
          key.keyVersion === match.keyVersion &&
          key.keyHash === match.keyHash,
      );
      if (!requested?.verified || !match.verified) continue;
      addReason(strongMatches, match.customerIdentityId, reasonFor(match.keyType));
    }

    const strongIds = [...strongMatches.keys()].sort();
    if (strongIds.length > 1) {
      await this.repository.recordReconciliation({
        caseType: "CONFLICT",
        reasonCode: "IDENTIFIER_CONFLICT",
        candidateIds: strongIds,
      });
      return result("CONFLICT", "IDENTIFIER_CONFLICT", null, strongIds, input);
    }
    if (strongIds.length === 1) {
      const id = strongIds[0]!;
      const reasons = strongMatches.get(id)!;
      return result("MATCHED", preferredReason(reasons), id, [id], input);
    }

    const weakIds = [...new Set(matches.map((match) => match.customerIdentityId))].sort();
    if (weakIds.length > 0) {
      await this.repository.recordReconciliation({
        caseType: "AMBIGUOUS",
        reasonCode: "MULTIPLE_MATCHES",
        candidateIds: weakIds,
      });
      return result("AMBIGUOUS", "MULTIPLE_MATCHES", null, weakIds, input);
    }

    if (keys.length === 0 && !input.existing1cRef?.trim()) {
      return result("AMBIGUOUS", "INSUFFICIENT_IDENTITY", null, [], input);
    }
    if (!input.createIfMissing) {
      return result("NEW", "NEW_IDENTITY", null, [], input);
    }

    const customerIdentityId = await this.repository.createIdentity({
      kind: input.customerType,
      keys,
      external1cRef: input.existing1cRef?.trim() || null,
    });
    return result(
      "NEW",
      "NEW_IDENTITY",
      customerIdentityId,
      [customerIdentityId],
      input,
    );
  }
}

function buildKeys(
  input: ResolveCustomerIdentityInput,
  verified: ReadonlySet<CustomerIdentityKeyType>,
): HashedIdentityKey[] {
  const keys: HashedIdentityKey[] = [];
  if (input.phone?.trim()) {
    keys.push(hashCustomerIdentityKey("PHONE", normalizeCustomerPhone(input.phone), verified.has("PHONE")));
  }
  if (input.email?.trim()) {
    keys.push(hashCustomerIdentityKey("EMAIL", normalizeCustomerEmail(input.email), verified.has("EMAIL")));
  }
  if (input.legalIdentifier?.trim()) {
    keys.push(
      hashCustomerIdentityKey(
        "LEGAL_IDENTIFIER",
        normalizeCustomerLegalIdentifier(input.legalIdentifier),
        verified.has("LEGAL_IDENTIFIER"),
      ),
    );
  }
  return keys;
}

function addReason(target: Map<string, Set<string>>, id: string, reason: string) {
  const reasons = target.get(id) ?? new Set<string>();
  reasons.add(reason);
  target.set(id, reasons);
}

function reasonFor(type: CustomerIdentityKeyType) {
  if (type === "LEGAL_IDENTIFIER") return "EXACT_LEGAL_IDENTIFIER" as const;
  if (type === "PHONE") return "EXACT_VERIFIED_PHONE" as const;
  return "EXACT_VERIFIED_EMAIL" as const;
}

function preferredReason(reasons: ReadonlySet<string>) {
  for (const reason of [
    "EXACT_1C_REF",
    "EXACT_LEGAL_IDENTIFIER",
    "EXACT_VERIFIED_PHONE",
    "EXACT_VERIFIED_EMAIL",
  ] as const) {
    if (reasons.has(reason)) return reason;
  }
  return "EXACT_VERIFIED_EMAIL" as const;
}

function result(
  status: CustomerIdentityResolution["status"],
  reason: CustomerIdentityResolution["reason"],
  customerIdentityId: string | null,
  candidateIds: readonly string[],
  input: ResolveCustomerIdentityInput,
): CustomerIdentityResolution {
  return {
    status,
    reason,
    customerIdentityId,
    candidateIds: input.exposeCandidateIds ? candidateIds : [],
  };
}
