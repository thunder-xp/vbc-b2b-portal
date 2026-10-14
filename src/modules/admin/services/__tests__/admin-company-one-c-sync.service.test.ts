import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PartnerProvider } from "@/src/modules/integration/contracts";
import type { PartnerContractDTO, PartnerPriceTypeDTO } from "@/src/modules/integration/dto";

import type { AdminCompanyRepository } from "../../repositories";
import { AdminCompanyOneCManualSyncService } from "../admin-company-one-c-sync.service";

const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const COUNTERPARTY_REF = "00000000-0000-4000-8000-000000000002";
const MAIN_REF = "00000000-0000-4000-8000-000000000003";
const CASH_REF = "00000000-0000-4000-8000-000000000004";
const PRICE_REF = "00000000-0000-4000-8000-000000000005";
const CURRENCY_REF = "00000000-0000-4000-8000-000000000006";
const ORGANIZATION_REF = "4643d461-aa49-4b70-9486-a59f80ee6af8";

describe("AdminCompanyOneCManualSyncService", () => {
  let repository: ReturnType<typeof repositoryFixture>;
  let provider: ReturnType<typeof providerFixture>;

  beforeEach(() => {
    repository = repositoryFixture();
    provider = providerFixture();
  });

  it("discovers an ADALIS-like missing main contract and proposes verified NS and cash contracts", async () => {
    const discovery = await service().discover(discoveryInput());
    expect(discovery.counterparty).toMatchObject({ reference: COUNTERPARTY_REF, verified: true });
    expect(discovery.previous.mainContractRef).toBeNull();
    expect(discovery.proposed).toMatchObject({
      mainContractRef: MAIN_REF,
      cashContractRef: null,
      priceTypeRef: PRICE_REF,
    });
    expect(discovery.canApply).toBe(true);
    expect(provider.fetchPartnerContracts).toHaveBeenCalledWith({
      partnerReference: COUNTERPARTY_REF,
    });
  });

  it("requires administrator selection when several eligible NS contracts exist", async () => {
    provider.fetchPartnerContracts.mockResolvedValue({
      items: [contract(MAIN_REF, "NS-1", "Основной"), contract("00000000-0000-4000-8000-000000000007", "NS-2", "Резерв"), cashContract()],
      nextCursor: null,
    });
    const discovery = await service().discover(discoveryInput());
    expect(discovery.errors).toContain("MULTIPLE_CONTRACT_CANDIDATES");
    expect(discovery.proposed.mainContractRef).toBeNull();
    expect(discovery.candidates.filter((item) => item.nsCandidate && item.eligible)).toHaveLength(2);
  });

  it("reports a missing NS contract without inventing a mapping", async () => {
    provider.fetchPartnerContracts.mockResolvedValue({ items: [cashContract()], nextCursor: null });
    const discovery = await service().discover(discoveryInput());
    expect(discovery.errors).toContain("CONTRACT_NOT_FOUND");
    expect(discovery.proposed.mainContractRef).toBeNull();
    expect(discovery.canApply).toBe(false);
  });

  it("reports a missing cash contract independently from the NS mapping", async () => {
    provider.fetchPartnerContracts.mockResolvedValue({ items: [contract()], nextCursor: null });
    const discovery = await service().discover(discoveryInput());
    expect(discovery.proposed.mainContractRef).toBe(MAIN_REF);
    expect(discovery.proposed.cashContractRef).toBeNull();
    expect(discovery.canApply).toBe(true);
  });

  it("isolates one price failure without losing the valid NS candidate", async () => {
    const brokenRef = "00000000-0000-4000-8000-000000000099";
    provider.fetchPartnerContracts.mockResolvedValue({ items: [contract(), { ...cashContract(), priceTypeReference: ref(brokenRef, "price-type") }], nextCursor: null });
    provider.fetchPriceType.mockImplementation(async ({ reference }: { reference: string }) => {
      if (reference === brokenRef) throw new Error("private upstream body");
      return priceType();
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const discovery = await service().discover(discoveryInput());
    expect(discovery.proposed.mainContractRef).toBe(MAIN_REF);
    expect(discovery.canApply).toBe(true);
    expect(discovery.candidates[0]).toMatchObject({ eligible: true, priceTypeName: "Оптовая" });
    expect(discovery.candidates[1]).toMatchObject({ eligible: false, priceTypeName: null, blockingCode: "PRICE_TYPE_NOT_DEFINED" });
    expect(discovery.errors).not.toContain("ONE_C_UNAVAILABLE");
    expect(JSON.stringify(warning.mock.calls)).not.toContain("private upstream body");
  });

  it("reports all unavailable price candidates without a discovery-level outage", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    provider.fetchPriceType.mockRejectedValue(new Error("unavailable"));
    const discovery = await service().discover(discoveryInput());
    expect(discovery.candidates.every(item => !item.eligible && item.blockingCode === "PRICE_TYPE_NOT_DEFINED")).toBe(true);
    expect(discovery.errors).not.toContain("ONE_C_UNAVAILABLE");
    expect(discovery.errors).toContain("CASH_CONTRACT_NOT_READY");
    expect(discovery.canApply).toBe(false);
  });

  it("does not infer cash role from the description or default contract", async () => {
    const discovery = await service().discover(discoveryInput());
    expect(discovery.proposed.cashContractRef).toBeNull();
    expect(discovery.candidates.find(item => item.contractRef === MAIN_REF)?.cashDisplayCandidate).toBe(true);
    expect(repository.mapCashContract).not.toHaveBeenCalled();
  });

  it("applies an eligible main contract while preserving an unresolved cash mapping", async () => {
    provider.fetchPartnerContracts.mockResolvedValue({ items: [contract()], nextCursor: null });
    const result = await service().apply({ ...discoveryInput(), ...versions(), mainContractRef: MAIN_REF, cashContractRef: null, reason: "Main non-cash profile repair without a cash assignment" });
    expect(result.status).toBe("success");
    expect(repository.mapCashContract).not.toHaveBeenCalled();
    expect(repository.applyManualContractSelection).toHaveBeenCalledOnce();
    expect(repository.mapContract).not.toHaveBeenCalled();
  });

  it("blocks a contract with no authoritative price type", async () => {
    provider.fetchPartnerContracts.mockResolvedValue({
      items: [{ ...contract(), priceTypeReference: null }, cashContract()], nextCursor: null,
    });
    const discovery = await service().discover(discoveryInput());
    expect(discovery.candidates.find((item) => item.contractRef === MAIN_REF)?.blockingCode).toBe("PRICE_TYPE_NOT_DEFINED");
  });

  it("blocks unresolved currency facts", async () => {
    provider.fetchPriceType.mockResolvedValue({ ...priceType(), currency: null });
    const discovery = await service().discover(discoveryInput());
    expect(discovery.candidates[0]?.blockingCode).toBe("CURRENCY_CONFLICT");
  });

  it("blocks an organization mismatch", async () => {
    provider.fetchPartnerContracts.mockResolvedValue({
      items: [{ ...contract(), organizationReference: ref("00000000-0000-4000-8000-000000000099", "organization") }, cashContract()],
      nextCursor: null,
    });
    const discovery = await service().discover(discoveryInput());
    expect(discovery.candidates.find((item) => item.contractRef === MAIN_REF)?.blockingCode).toBe("ORGANIZATION_MISMATCH");
  });

  it("rejects a live counterparty that conflicts with the verified binding", async () => {
    provider.fetchPartnerByReference.mockResolvedValue({ ...partner(), code: "OTHER" });
    await expect(service().discover(discoveryInput())).rejects.toMatchObject({ code: "COUNTERPARTY_CONFLICT" });
    expect(repository.publishManualOneCSnapshot).not.toHaveBeenCalled();
  });

  it("publishes the bounded snapshot, maps both roles and reaches READY", async () => {
    const result = await service().apply({
      companyId: COMPANY_ID,
      ...versions(),
      mainContractRef: MAIN_REF,
      cashContractRef: CASH_REF,
      reason: "Verified controlled commercial synchronization",
      correlationId: "00000000-0000-4000-8000-000000000010",
    });
    expect(result).toMatchObject({ status: "success", readiness: "READY", mainContractRef: MAIN_REF, cashContractRef: CASH_REF });
    expect(repository.prepareManualContractSelection).toHaveBeenCalledWith(expect.objectContaining({ mainContractRef: MAIN_REF, cashContractRef: CASH_REF, source: expect.objectContaining({ default: false }) }));
    expect(repository.applyManualContractSelection).toHaveBeenCalledWith("verification-id");
    expect(repository.mapContract).not.toHaveBeenCalled();
    expect(repository.mapCashContract).not.toHaveBeenCalled();
    expect(repository.publishCommercialProfileSync).not.toHaveBeenCalled();
  });

  it("does not publish when the 1C request fails", async () => {
    provider.fetchPartnerContracts.mockRejectedValue(new Error("unavailable"));
    await expect(service().discover(discoveryInput())).rejects.toThrow("unavailable");
    expect(repository.publishManualOneCSnapshot).not.toHaveBeenCalled();
    expect(repository.mapContract).not.toHaveBeenCalled();
  });

  it("rejects arbitrary contract GUIDs that were not returned by the fresh lookup", async () => {
    await expect(service().apply({
      companyId: COMPANY_ID,
      ...versions(),
      mainContractRef: "00000000-0000-4000-8000-000000000099",
      cashContractRef: CASH_REF,
      reason: "Attempt to submit an unverified contract reference",
      correlationId: "00000000-0000-4000-8000-000000000011",
    })).rejects.toMatchObject({ code: "CONTRACT_NOT_FOUND" });
    expect(repository.publishManualOneCSnapshot).not.toHaveBeenCalled();
  });

  it("preserves the independent access and commercial status fields", async () => {
    await service().apply({
      companyId: COMPANY_ID,
      ...versions(),
      mainContractRef: MAIN_REF,
      cashContractRef: CASH_REF,
      reason: "Commercial synchronization without lifecycle changes",
      correlationId: "00000000-0000-4000-8000-000000000012",
    });
    const published = repository.prepareManualContractSelection.mock.calls[0]?.[0];
    expect(published?.snapshot).not.toHaveProperty("status");
    expect(published?.snapshot).not.toHaveProperty("accessStatus");
  });

  it("rejects stale reviewed versions before preparing evidence", async () => {
    const result = await service().apply({ ...discoveryInput(), ...versions(), expectedContractVersion: 0, mainContractRef: MAIN_REF, cashContractRef: CASH_REF, reason: "Explicit governed selection" });
    expect(result.code).toBe("MANUAL_SELECTION_CONFLICT");
    expect(repository.prepareManualContractSelection).not.toHaveBeenCalled();
  });

  it.each([
    { counterpartyReference: CASH_REF }, { contractReference: CASH_REF },
    { organizationReference: CASH_REF }, { contractType: "СПоставщиком" },
    { active: false }, { deleted: true }, { priceTypeReference: CASH_REF },
    { priceTypeActive: false }, { priceTypeCurrencyReference: null }, { contractCurrencyReference: null },
  ])("rejects changed live commercial facts %j before persistence", async (change) => {
    provider.fetchCommercialProfile.mockResolvedValue({ ...(await provider.fetchCommercialProfile()), ...change });
    const result = await service().apply({ ...discoveryInput(), ...versions(), mainContractRef: MAIN_REF, cashContractRef: CASH_REF, reason: "Explicit governed selection" });
    expect(result.status).toBe("error");
    expect(repository.prepareManualContractSelection).not.toHaveBeenCalled();
  });

  it("returns atomic failure without retrying legacy mapping operations", async () => {
    repository.applyManualContractSelection.mockResolvedValue({ status: "error", code: "COMMERCIAL_PRICE_DATA_STALE" });
    const result = await service().apply({ ...discoveryInput(), ...versions(), mainContractRef: MAIN_REF, cashContractRef: CASH_REF, reason: "Explicit governed selection" });
    expect(result.status).toBe("error");
    expect(repository.mapContract).not.toHaveBeenCalled();
    expect(repository.publishCommercialProfileSync).not.toHaveBeenCalled();
  });

  function service() {
    return new AdminCompanyOneCManualSyncService(
      repository as unknown as AdminCompanyRepository,
      provider as unknown as PartnerProvider,
    );
  }
});

function versions() { return { expectedContractVersion: 1, expectedCashVersion: 0, expectedProfileVersion: 2 }; }

function discoveryInput() {
  return { companyId: COMPANY_ID, correlationId: "00000000-0000-4000-8000-000000000009" };
}

function repositoryFixture() {
  let finalRead = 0;
  return {
    getOverview: vi.fn().mockResolvedValue({
      companyId: COMPANY_ID,
      displayName: "ADALIS COM SRL",
      fiscalCode: "1026600015223",
      external1cId: COUNTERPARTY_REF,
      external1cCode: "UU-002011",
    }),
    getContractMapping: vi.fn().mockImplementation(async () => {
      finalRead += 1;
      return mapping(finalRead > 1);
    }),
    prepareManualContractSelection: vi.fn().mockResolvedValue("verification-id"),
    applyManualContractSelection: vi.fn().mockResolvedValue({ status: "success", readiness: "READY", code: "MANUAL_ONE_C_SYNC_SUCCESS", mainContractRef: MAIN_REF, cashContractRef: CASH_REF, priceTypeRef: PRICE_REF }),
    publishManualOneCSnapshot: vi.fn().mockResolvedValue({ code: "MANUAL_ONE_C_SNAPSHOT_PUBLISHED" }),
    mapContract: vi.fn().mockResolvedValue({ code: "CONTRACT_MAPPING_SUCCESS" }),
    mapCashContract: vi.fn().mockResolvedValue({ code: "CASH_CONTRACT_MAPPING_SUCCESS" }),
    beginCommercialProfileSync: vi.fn().mockResolvedValue({
      code: "COMMERCIAL_PROFILE_SYNC_SUCCESS",
      claimed: true,
      runId: "00000000-0000-4000-8000-000000000020",
      counterpartyRef: COUNTERPARTY_REF,
      contractRef: MAIN_REF,
    }),
    publishCommercialProfileSync: vi.fn().mockResolvedValue({ code: "COMMERCIAL_PROFILE_SYNC_SUCCESS" }),
    failCommercialProfileSync: vi.fn(),
    getManualOneCSyncEvents: vi.fn().mockResolvedValue([]),
  };
}

function providerFixture() {
  return {
    fetchPartnerByReference: vi.fn().mockResolvedValue(partner()),
    searchPartners: vi.fn(),
    fetchPartnerContracts: vi.fn().mockResolvedValue({ items: [contract(), cashContract()], nextCursor: null }),
    resolveCustomerOrderContract: vi.fn().mockResolvedValue(contract()),
    fetchPriceType: vi.fn().mockResolvedValue(priceType()),
    fetchCommercialProfile: vi.fn().mockResolvedValue({
      counterpartyReference: COUNTERPARTY_REF,
      contractReference: MAIN_REF,
      priceTypeReference: PRICE_REF,
      organizationReference: ORGANIZATION_REF, contractType: "СПокупателем", active: true, deleted: false, default: false,
      contractCurrencyReference: CURRENCY_REF, priceTypeCurrencyReference: CURRENCY_REF, priceTypeActive: true, verifiedAt: new Date().toISOString(),
    }),
  };
}

function partner() {
  return {
    reference: ref(COUNTERPARTY_REF, "partner-company"),
    code: "UU-002011",
    displayName: "ADALIS COM SRL",
    legalName: "ADALIS COM SRL",
    fullName: "ADALIS COM SRL",
    taxId: "1026600015223",
    status: "active",
    active: true,
    buyer: true,
    supplier: false,
    managerReference: null,
    metadata: { sourceReference: ref(COUNTERPARTY_REF, "partner-company"), sourceUpdatedAt: null, importedAt: null },
    contracts: [],
    priceTypes: [],
  };
}

function contract(reference = MAIN_REF, number = "NS-158/0209/26", name = "Основной договор"): PartnerContractDTO {
  return {
    reference: ref(reference, "partner-contract"),
    ownerReference: ref(COUNTERPARTY_REF, "partner-company"),
    code: "UU-002754",
    name,
    number,
    date: "2026-09-02T00:00:00Z",
    contractType: "СПокупателем",
    organizationReference: ref(ORGANIZATION_REF, "organization"),
    settlementCurrencyReference: ref(CURRENCY_REF, "currency"),
    signed: false,
    deleted: false,
    isDefault: reference === MAIN_REF,
    active: true,
    priceTypeReference: ref(PRICE_REF, "price-type"),
    priceTypeName: "Оптовая",
    priceTypeSource: "contract",
  };
}

function cashContract(): PartnerContractDTO {
  return contract(CASH_REF, "CASH-1", "С покупателем");
}

function priceType(): PartnerPriceTypeDTO {
  return {
    reference: ref(PRICE_REF, "price-type"),
    name: "Оптовая",
    currency: CURRENCY_REF,
    includesVat: true,
    type: null,
    isDefault: false,
    active: true,
  };
}

function mapping(ready: boolean) {
  return {
    companyId: COMPANY_ID,
    counterpartyRef: COUNTERPARTY_REF,
    currentContractRef: ready ? MAIN_REF : null,
    currentPriceTypeRef: ready ? PRICE_REF : null,
    currentPriceTypeName: ready ? "Оптовая" : null,
    currentCurrencyCode: ready ? "MDL" : null,
    commercialProfileState: ready ? "aligned" : "price_type_unknown",
    commercialProfileVersion: 2,
    commercialProfileVerifiedAt: null,
    priceSnapshotAt: null,
    publishedPriceCount: ready ? 10 : 0,
    version: 1,
    canManage: true,
    canSync: true,
    suggestedContractRef: null,
    suggestedCashContractRef: null,
    defaultContractAmbiguous: false,
    readiness: { class: ready ? "READY" : "UNKNOWN_PRICE_TYPE", ready },
    cashMapping: { contractRef: ready ? CASH_REF : null, version: 0, active: ready, qualified: ready, events: [] },
    candidates: [{ external1cId: MAIN_REF }, { external1cId: CASH_REF }],
  };
}

function ref(externalId: string, externalType: string) {
  return { providerCode: "one-c", externalId, externalType };
}
