import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CustomerIdentityRepository } from "../repository";
import { CustomerIdentityResolutionService } from "../service";
import type { IdentityKeyMatch } from "../types";

class FakeRepository implements CustomerIdentityRepository {
  matches: IdentityKeyMatch[] = [];
  externalId: string | null = null;
  created = 0;
  reconciliations: string[] = [];
  async findKeyMatches() { return this.matches; }
  async findExternalRef() { return this.externalId ? { customerIdentityId: this.externalId, system: "1C", entityType: "COUNTERPARTY", externalId: "one-c" } : null; }
  async createIdentity() { this.created += 1; return "00000000-0000-4000-8000-000000000099"; }
  async recordReconciliation(input: Parameters<CustomerIdentityRepository["recordReconciliation"]>[0]) { this.reconciliations.push(input.reasonCode); }
}

describe("CustomerIdentityResolutionService", () => {
  beforeEach(() => {
    vi.stubEnv("CUSTOMER_IDENTITY_HMAC_SECRET", "customer-identity-test-secret-at-least-32-bytes");
    vi.stubEnv("CUSTOMER_IDENTITY_HMAC_KEY_VERSION", "1");
  });

  it("creates a new person and a new legal entity only when evidence exists", async () => {
    const repository = new FakeRepository();
    const service = new CustomerIdentityResolutionService(repository);
    await expect(service.resolve({ customerType: "PERSON", email: "a@example.md", createIfMissing: true })).resolves.toMatchObject({ status: "NEW", reason: "NEW_IDENTITY" });
    await expect(service.resolve({ customerType: "LEGAL_ENTITY", legalIdentifier: "100200300", createIfMissing: true })).resolves.toMatchObject({ status: "NEW", reason: "NEW_IDENTITY" });
    expect(repository.created).toBe(2);
  });

  it.each([
    ["LEGAL_IDENTIFIER", "EXACT_LEGAL_IDENTIFIER"],
    ["PHONE", "EXACT_VERIFIED_PHONE"],
    ["EMAIL", "EXACT_VERIFIED_EMAIL"],
  ] as const)("matches an exact verified %s", async (keyType, reason) => {
    const repository = new FakeRepository();
    const service = new CustomerIdentityResolutionService(repository);
    const input = keyType === "PHONE" ? { phone: "+37369123456" } : keyType === "EMAIL" ? { email: "a@example.md" } : { legalIdentifier: "100200300" };
    const first = await service.resolve({ customerType: keyType === "LEGAL_IDENTIFIER" ? "LEGAL_ENTITY" : "PERSON", ...input, verifiedKeyTypes: [keyType], createIfMissing: true });
    repository.matches = [{ customerIdentityId: first.customerIdentityId!, keyType, keyHash: expect.any(String) as unknown as string, keyVersion: 1, verified: true }];
    const hashed = (await import("../hmac")).hashCustomerIdentityKey(keyType, keyType === "PHONE" ? "+37369123456" : keyType === "EMAIL" ? "a@example.md" : "100200300", true);
    repository.matches[0] = { ...repository.matches[0]!, ...hashed };
    await expect(service.resolve({ customerType: keyType === "LEGAL_IDENTIFIER" ? "LEGAL_ENTITY" : "PERSON", ...input, verifiedKeyTypes: [keyType] })).resolves.toMatchObject({ status: "MATCHED", reason, customerIdentityId: first.customerIdentityId });
  });

  it("returns conflict for different strong roots and ambiguity for weak evidence", async () => {
    const repository = new FakeRepository();
    const { hashCustomerIdentityKey } = await import("../hmac");
    const phone = hashCustomerIdentityKey("PHONE", "+37369123456", true);
    const email = hashCustomerIdentityKey("EMAIL", "a@example.md", true);
    repository.matches = [{ customerIdentityId: "root-a", ...phone }, { customerIdentityId: "root-b", ...email }];
    const service = new CustomerIdentityResolutionService(repository);
    await expect(service.resolve({ customerType: "PERSON", phone: "+37369123456", email: "a@example.md", verifiedKeyTypes: ["PHONE", "EMAIL"] })).resolves.toMatchObject({ status: "CONFLICT", reason: "IDENTIFIER_CONFLICT" });
    repository.matches = [{ customerIdentityId: "root-a", ...phone, verified: false }];
    await expect(service.resolve({ customerType: "PERSON", phone: "+37369123456" })).resolves.toMatchObject({ status: "AMBIGUOUS", reason: "MULTIPLE_MATCHES" });
    expect(repository.reconciliations).toEqual(["IDENTIFIER_CONFLICT", "MULTIPLE_MATCHES"]);
  });

  it("does not create a root from insufficient identity", async () => {
    const repository = new FakeRepository();
    await expect(new CustomerIdentityResolutionService(repository).resolve({ customerType: "PERSON", createIfMissing: true })).resolves.toMatchObject({ status: "AMBIGUOUS", reason: "INSUFFICIENT_IDENTITY", customerIdentityId: null });
    expect(repository.created).toBe(0);
  });
});
