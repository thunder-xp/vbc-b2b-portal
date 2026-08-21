import { parseRequiredOneCGuid } from "@/src/modules/integration/providers/one-c/one-c-guid";
import { normalizeFiscalCode } from "@/src/modules/company-identity/fiscal-code";

import type {
  CounterpartyContractRow,
  CounterpartyDirectoryRow,
  CounterpartyPriceProfileRow,
  DeliveryCarrierRow,
} from "../types";

type UnknownRow = Record<string, unknown>;

export function normalizeDirectoryText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeMatchText(value: string | null): string | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .toLocaleLowerCase("ru")
    .replace(/[^\p{L}\p{N}]+/gu, "");
  return normalized.length > 0 ? normalized : null;
}

export function normalizePhone(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/\D+/g, "");
  return normalized.length > 0 ? normalized : null;
}

export function parseCounterpartyRow(row: unknown): CounterpartyDirectoryRow | null {
  if (!isRecord(row) || row.IsFolder === true) return null;
  const external1cId = parseRequiredOneCGuid(row.Ref_Key);
  const name =
    normalizeDirectoryText(row.Description) ??
    normalizeDirectoryText(row["НаименованиеПолное"]);
  if (!external1cId || !name) return null;

  const fiscalCode = normalizeDirectoryText(row["ИНН"]);
  const phone = normalizeDirectoryText(row["Телефон"]);
  const email = normalizeDirectoryText(row["ЭлектроннаяПочта"]);

  return {
    external1cId,
    externalCode: normalizeDirectoryText(row.Code),
    name,
    normalizedName: normalizeMatchText(name) ?? name.toLocaleLowerCase("ru"),
    fiscalCode,
    normalizedFiscalCode: normalizeFiscalCode(fiscalCode),
    isActive: row["Недействителен"] !== true && row.DeletionMark !== true,
    isDeleted: row.DeletionMark === true,
    phone,
    normalizedPhone: normalizePhone(phone),
    email,
    normalizedEmail: email?.toLocaleLowerCase("ru") ?? null,
    locality: normalizeDirectoryText(row["НаселенныйПункт"]),
    assignedManagerExternalId: parseRequiredOneCGuid(row["МенеджерПокупателя_Key"]),
    assignedManagerName: null,
    sourceUpdatedAt: null,
    counterpartyTypeCode: normalizeDirectoryText(row["ВидКонтрагента"]),
    governmentBodyTypeCode: normalizeDirectoryText(row["ВидГосударственногоОргана"]),
  };
}

export function parseDeliveryCarrierRow(row: unknown): DeliveryCarrierRow | null {
  if (!isRecord(row)) return null;
  const external1cId = parseRequiredOneCGuid(row.Ref_Key);
  const name = normalizeDirectoryText(row.Description);
  if (!external1cId || !name) return null;
  return {
    external1cId,
    code: normalizeDirectoryText(row.Code),
    name,
    isActive: row["Недействителен"] !== true && row.DeletionMark !== true,
    isDeleted: row.DeletionMark === true,
  };
}

export function parseContractRow(row: unknown): CounterpartyContractRow | null {
  if (!isRecord(row)) return null;
  const external1cId = parseRequiredOneCGuid(row.Ref_Key);
  const counterpartyExternal1cId = parseRequiredOneCGuid(row.Owner);
  const name = normalizeDirectoryText(row.Description);
  if (
    !external1cId ||
    !counterpartyExternal1cId ||
    !name ||
    row.Owner_Type !== "StandardODATA.Catalog_Контрагенты"
  ) {
    return null;
  }

  return {
    counterpartyExternal1cId,
    external1cId,
    code: normalizeDirectoryText(row.Code),
    name,
    number: normalizeDirectoryText(row["НомерДоговора"]),
    date: normalizeDirectoryText(row["ДатаДоговора"]),
    contractType: normalizeDirectoryText(row["ВидДоговора"]),
    organizationExternal1cId: parseRequiredOneCGuid(row["Организация_Key"]),
    currencyExternal1cId: parseRequiredOneCGuid(row["ВалютаРасчетов_Key"]),
    signed: typeof row["ДоговорПодписан"] === "boolean" ? row["ДоговорПодписан"] : null,
    isDefault: false,
    priceTypeExternal1cId:
      parseRequiredOneCGuid(row["ВидЦенКонтрагента_Key"]) ??
      parseRequiredOneCGuid(row["ВидЦен_Key"]),
    isActive: row["Недействителен"] !== true && row.DeletionMark !== true,
    isDeleted: row.DeletionMark === true,
  };
}

export function toPriceProfileRow(
  contract: CounterpartyContractRow,
  priceType: unknown,
): CounterpartyPriceProfileRow | null {
  if (!contract.priceTypeExternal1cId || !isRecord(priceType)) return null;
  const external1cId = parseRequiredOneCGuid(priceType.Ref_Key);
  const name = normalizeDirectoryText(priceType.Description);
  if (!external1cId || external1cId !== contract.priceTypeExternal1cId || !name) {
    return null;
  }

  return {
    counterpartyExternal1cId: contract.counterpartyExternal1cId,
    external1cId,
    code: normalizeDirectoryText(priceType.Code),
    name,
    isActive: priceType["ЦеныАктуальны"] !== false && priceType.DeletionMark !== true,
    isDeleted: priceType.DeletionMark === true,
  };
}

function isRecord(value: unknown): value is UnknownRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
