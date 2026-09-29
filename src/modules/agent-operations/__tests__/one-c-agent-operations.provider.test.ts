import { describe, expect, it, vi } from "vitest";
import type { OneCODataClient } from "@/src/modules/integration/providers/one-c/one-c-odata-client";
import { OneCAgentOperationsProvider } from "../one-c-agent-operations.provider";

const PROPERTY = "11111111-1111-1111-1111-111111111111";
const PROPERTY_ALIAS = "11111111-1111-1111-1111-111111111112";
const COUNTERPARTY = "22222222-2222-2222-2222-222222222222";
const CONTRACT = "33333333-3333-3333-3333-333333333333";
const PROJECT = "44444444-4444-4444-4444-444444444444";

describe("OneCAgentOperationsProvider", () => {
  it("accepts a contract only through its exact Counterparty relation and exact custom Agent code", async () => {
    const client = mockClient();
    client.getFilteredCollection
      .mockResolvedValueOnce({ value: [contractRow("MD-P-001")] })
      .mockResolvedValueOnce({ value: [propertyRow()] });
    const result = await provider(client).listContracts(COUNTERPARTY, "MD-P-001");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ reference: CONTRACT, counterpartyRef: COUNTERPARTY, codeState: "MATCH", sourceAgentCode: "MD-P-001" });
    expect(client.getFilteredCollection.mock.calls[0][0]).toBe("Catalog_ДоговорыКонтрагентов");
    expect(client.getFilteredCollection.mock.calls[0][1].filter).toContain(COUNTERPARTY);
  });

  it("returns MISMATCH instead of fuzzy-matching a different Agent code", async () => {
    const client = mockClient();
    client.getFilteredCollection.mockResolvedValueOnce({ value: [propertyRow()] });
    client.get.mockResolvedValueOnce(contractRow("MD-P-010"));
    const result = await provider(client).verifyContract(CONTRACT, COUNTERPARTY, "MD-P-001");
    expect(result.codeState).toBe("MISMATCH");
  });

  it("accepts multiple governed metadata definitions when the object has one unique Agent code", async () => {
    const client = mockClient();
    client.getFilteredCollection
      .mockResolvedValueOnce({ value: [contractRow("MD-P-001", PROPERTY_ALIAS)] })
      .mockResolvedValueOnce({ value: [propertyRow(), propertyRow(PROPERTY_ALIAS)] });
    const result = await provider(client).listContracts(COUNTERPARTY, "MD-P-001");
    expect(result[0]).toMatchObject({ codeState: "MATCH", sourceAgentCode: "MD-P-001" });
  });

  it("fails closed when governed metadata definitions contain conflicting Agent codes", async () => {
    const client = mockClient();
    const row = contractRow("MD-P-001");
    const extrasKey = Object.keys(row).find((key) => Array.isArray(row[key as keyof typeof row]));
    expect(extrasKey).toBeDefined();
    (row as Record<string, unknown>)[extrasKey!] = [
      ...custom("MD-P-001"),
      ...custom("MD-P-002", PROPERTY_ALIAS),
    ];
    client.getFilteredCollection
      .mockResolvedValueOnce({ value: [row] })
      .mockResolvedValueOnce({ value: [propertyRow(), propertyRow(PROPERTY_ALIAS)] });
    await expect(provider(client).listContracts(COUNTERPARTY, "MD-P-001"))
      .rejects.toThrow("ONEC_AGENT_CODE_PROPERTY_AMBIGUOUS");
  });

  it("rejects a project related to another contract even when its name contains the Agent code", async () => {
    const client = mockClient();
    client.get.mockResolvedValueOnce({ ...projectRow(), Договор_Key: "55555555-5555-5555-5555-555555555555" });
    await expect(provider(client).verifyProject(PROJECT, COUNTERPARTY, CONTRACT, "MD-P-001"))
      .rejects.toThrow("ONEC_PROJECT_RELATION_MISMATCH");
  });

  it("uses a structured project-name token only together with exact Counterparty and Contract relations", async () => {
    const client = mockClient();
    client.get.mockResolvedValueOnce(projectRow());
    client.getFilteredCollection.mockResolvedValueOnce({ value: [] });
    const result = await provider(client).verifyProject(PROJECT, COUNTERPARTY, CONTRACT, "MD-P-001");
    expect(result).toMatchObject({ codeState: "MATCH", codeEvidence: "STRUCTURED_NAME", sourceAgentCode: "MD-P-001" });
  });
});

function provider(client: ReturnType<typeof mockClient>) { return new OneCAgentOperationsProvider(client as unknown as OneCODataClient); }
function mockClient() { return { get: vi.fn(), getFilteredCollection: vi.fn() }; }
function propertyRow(reference = PROPERTY) { return { Ref_Key: reference, Description: "NSD Код агента", DeletionMark: false }; }
function custom(code: string, propertyRef = PROPERTY) { return [{ Свойство_Key: propertyRef, ТекстоваяСтрока: code }]; }
function contractRow(code: string, propertyRef = PROPERTY) { return { Ref_Key: CONTRACT, Code: "UU-002780", Description: "Договор оказания услуг", DeletionMark: false, Недействителен: false, Owner: COUNTERPARTY, Owner_Type: "StandardODATA.Catalog_Контрагенты", НомерДоговора: "NS-181", ДатаДоговора: "2026-09-23", СрокДействия: "2027-09-23", ДоговорПодписан: true, ВидДоговора: "СПоставщиком", ДополнительныеРеквизиты: custom(code, propertyRef) }; }
function projectRow() { return { Ref_Key: PROJECT, Code: "AGT-1", Description: "AGT · MD-P-001 · Pilot", DeletionMark: false, Контрагент_Key: COUNTERPARTY, Договор_Key: CONTRACT, ДатаНачала: "2026-09-23", ДатаОкончания: null, ДополнительныеРеквизиты: [] }; }
