import "server-only";

import { getOneCEnv } from "@/src/lib/env";
import { OneCODataClient } from "@/src/modules/integration/providers/one-c/one-c-odata-client";

import type { AgentCodeState, AgentContractCandidate, AgentProjectCandidate } from "./types";

const GUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const COUNTERPARTY = "Catalog_Контрагенты";
const CONTRACT = "Catalog_ДоговорыКонтрагентов";
const PROJECT = "Catalog_Проекты";
const PROPERTY = "ChartOfCharacteristicTypes_ДополнительныеРеквизитыИСведения";
const AGENT_CODE_PROPERTY_NAMES = ["NSD Код агента", "NSD код агента"] as const;

export class OneCAgentOperationsProvider {
  private readonly client: OneCODataClient;
  private propertyRef: string | null | undefined;

  constructor(client?: OneCODataClient) {
    this.client = client ?? new OneCODataClient(getOneCEnv());
  }

  async verifyCounterparty(reference: string, expectedAgentCode: string) {
    const ref = requireGuid(reference);
    const row = record(await this.client.get(`${COUNTERPARTY}(guid'${ref}')`, {
      $select: "Ref_Key,Code,Description,DeletionMark,Недействителен,ИНН,ДополнительныеРеквизиты",
    }, { requestKind: "agent_counterparty_verify" }));
    const sourceAgentCode = await this.agentCode(row);
    return {
      reference: ref,
      externalCode: requiredText(row.Code),
      fiscalCode: optionalText(row["ИНН"]),
      name: requiredText(row.Description),
      active: row.DeletionMark === false && row["Недействителен"] !== true,
      deleted: row.DeletionMark === true,
      sourceAgentCode,
      codeState: codeState(sourceAgentCode, expectedAgentCode),
      observedAt: new Date().toISOString(),
    };
  }

  async listContracts(counterpartyRef: string, expectedAgentCode: string): Promise<AgentContractCandidate[]> {
    const owner = requireGuid(counterpartyRef);
    const payload = await this.client.getFilteredCollection(CONTRACT, {
      select: "Ref_Key,Code,Description,DeletionMark,Недействителен,Owner,Owner_Type,НомерДоговора,ДатаДоговора,СрокДействия,ДоговорПодписан,ВидДоговора,ДополнительныеРеквизиты",
      filter: `Owner eq guid'${owner}'`, top: 50,
    }, { requestKind: "agent_contract_candidates" });
    return Promise.all(collection(payload).map((row) => this.mapContract(row, owner, expectedAgentCode)));
  }

  async verifyContract(reference: string, counterpartyRef: string, expectedAgentCode: string) {
    const ref = requireGuid(reference);
    const owner = requireGuid(counterpartyRef);
    const row = record(await this.client.get(`${CONTRACT}(guid'${ref}')`, {
      $select: "Ref_Key,Code,Description,DeletionMark,Недействителен,Owner,Owner_Type,НомерДоговора,ДатаДоговора,СрокДействия,ДоговорПодписан,ВидДоговора,ДополнительныеРеквизиты",
    }, { requestKind: "agent_contract_verify" }));
    return this.mapContract(row, owner, expectedAgentCode);
  }

  async listProjects(counterpartyRef: string, contractRef: string, expectedAgentCode: string): Promise<AgentProjectCandidate[]> {
    const counterparty = requireGuid(counterpartyRef);
    const contract = requireGuid(contractRef);
    const payload = await this.client.getFilteredCollection(PROJECT, {
      select: "Ref_Key,Code,Description,DeletionMark,ДатаНачала,ДатаОкончания,Контрагент_Key,Договор_Key,ДополнительныеРеквизиты",
      filter: `Контрагент_Key eq guid'${counterparty}' and Договор_Key eq guid'${contract}'`, top: 50,
    }, { requestKind: "agent_project_candidates" });
    return Promise.all(collection(payload).map((row) => this.mapProject(row, counterparty, contract, expectedAgentCode)));
  }

  async verifyProject(reference: string, counterpartyRef: string, contractRef: string, expectedAgentCode: string) {
    const ref = requireGuid(reference);
    const counterparty = requireGuid(counterpartyRef);
    const contract = requireGuid(contractRef);
    const row = record(await this.client.get(`${PROJECT}(guid'${ref}')`, {
      $select: "Ref_Key,Code,Description,DeletionMark,ДатаНачала,ДатаОкончания,Контрагент_Key,Договор_Key,ДополнительныеРеквизиты",
    }, { requestKind: "agent_project_verify" }));
    return this.mapProject(row, counterparty, contract, expectedAgentCode);
  }

  private async mapContract(row: Record<string, unknown>, owner: string, expected: string): Promise<AgentContractCandidate> {
    const actualOwner = requireGuidValue(row.Owner);
    if (actualOwner !== owner || optionalText(row.Owner_Type) !== "StandardODATA.Catalog_Контрагенты") {
      throw new Error("ONEC_CONTRACT_COUNTERPARTY_MISMATCH");
    }
    const sourceAgentCode = await this.agentCode(row);
    return {
      reference: requireGuidValue(row.Ref_Key), counterpartyRef: actualOwner,
      number: optionalText(row["НомерДоговора"]), name: requiredText(row.Description),
      contractType: requiredText(row["ВидДоговора"]), contractDate: dateOrNull(row["ДатаДоговора"]),
      validUntil: dateOrNull(row["СрокДействия"]), signed: booleanOrNull(row["ДоговорПодписан"]),
      active: row.DeletionMark === false && row["Недействителен"] !== true,
      deleted: row.DeletionMark === true, sourceAgentCode, codeState: codeState(sourceAgentCode, expected),
      observedAt: new Date().toISOString(),
    };
  }

  private async mapProject(row: Record<string, unknown>, counterparty: string, contract: string, expected: string): Promise<AgentProjectCandidate> {
    const actualCounterparty = requireGuidValue(row["Контрагент_Key"]);
    const actualContract = requireGuidValue(row["Договор_Key"]);
    if (actualCounterparty !== counterparty || actualContract !== contract) throw new Error("ONEC_PROJECT_RELATION_MISMATCH");
    const propertyCode = await this.agentCode(row);
    const name = requiredText(row.Description);
    const structuredNameMatch = exactStructuredNameContainsCode(name, expected);
    const sourceAgentCode = propertyCode ?? (structuredNameMatch ? expected : null);
    const codeEvidence = propertyCode ? "CUSTOM_PROPERTY" : structuredNameMatch ? "STRUCTURED_NAME" : "NONE";
    return {
      reference: requireGuidValue(row.Ref_Key), code: optionalText(row.Code), name,
      counterpartyRef: actualCounterparty, contractRef: actualContract,
      startDate: dateOrNull(row["ДатаНачала"]), endDate: dateOrNull(row["ДатаОкончания"]),
      active: row.DeletionMark === false, deleted: row.DeletionMark === true,
      sourceAgentCode, codeState: codeState(sourceAgentCode, expected), codeEvidence,
      observedAt: new Date().toISOString(),
    };
  }

  private async agentCode(row: Record<string, unknown>): Promise<string | null> {
    const propertyRef = await this.agentCodePropertyRef();
    if (!propertyRef) return null;
    const matches = rows(row["ДополнительныеРеквизиты"])
      .filter((item) => guid(item["Свойство_Key"]) === propertyRef)
      .map((item) => optionalText(item["ТекстоваяСтрока"]) ?? scalarText(item["Значение"]))
      .filter((value): value is string => Boolean(value));
    if (matches.length > 1) throw new Error("ONEC_AGENT_CODE_PROPERTY_AMBIGUOUS");
    return matches[0] ?? null;
  }

  private async agentCodePropertyRef(): Promise<string | null> {
    if (this.propertyRef !== undefined) return this.propertyRef;
    const filters = AGENT_CODE_PROPERTY_NAMES.map((name) => `Description eq '${name.replaceAll("'", "''")}'`).join(" or ");
    const payload = await this.client.getFilteredCollection(PROPERTY, {
      select: "Ref_Key,Description,Имя,Заголовок,DeletionMark,Доступен", filter: `(${filters}) and DeletionMark eq false`, top: 10,
    }, { requestKind: "agent_code_property_resolve" });
    const exact = collection(payload).filter((item) => AGENT_CODE_PROPERTY_NAMES.includes(requiredText(item.Description) as typeof AGENT_CODE_PROPERTY_NAMES[number]));
    if (exact.length > 1) throw new Error("ONEC_AGENT_CODE_PROPERTY_AMBIGUOUS");
    this.propertyRef = exact[0] ? requireGuidValue(exact[0].Ref_Key) : null;
    return this.propertyRef;
  }
}

function codeState(value: string | null, expected: string): AgentCodeState { return value === null ? "MISSING" : value === expected ? "MATCH" : "MISMATCH"; }
function exactStructuredNameContainsCode(name: string, code: string) { return name.split(/[·|]/u).map((part) => part.trim()).includes(code); }
function collection(value: unknown) { return rows(record(value).value); }
function rows(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : []; }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_ONEC_RESPONSE"); return value as Record<string, unknown>; }
function optionalText(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function scalarText(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value).trim() || null : null; }
function requiredText(value: unknown) { const result = optionalText(value); if (!result) throw new Error("INVALID_ONEC_TEXT"); return result; }
function guid(value: unknown) { const result = optionalText(value)?.toLowerCase() ?? null; return result && GUID.test(result) ? result : null; }
function requireGuid(value: string) { const result = guid(value); if (!result) throw new Error("INVALID_ONEC_GUID"); return result; }
function requireGuidValue(value: unknown) { const result = guid(value); if (!result) throw new Error("INVALID_ONEC_GUID"); return result; }
function dateOrNull(value: unknown) { const raw = optionalText(value); if (!raw) return null; const parsed = new Date(raw); return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null; }
function booleanOrNull(value: unknown) { return typeof value === "boolean" ? value : null; }
