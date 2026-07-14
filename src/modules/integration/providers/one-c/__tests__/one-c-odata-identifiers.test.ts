import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ONE_C_CONTRACT_FIELDS,
  ONE_C_DEFAULT_PARTNER_CONTRACT_FIELDS,
  ONE_C_PARTNER_FIELDS,
  ONE_C_PRICE_TYPE_FIELDS,
  ONE_C_RESOURCES,
} from "../one-c-odata-identifiers";

const integrationRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

describe("1C OData identifiers", () => {
  it("uses exact UTF-8 resource and partner field identifiers", () => {
    expect(ONE_C_RESOURCES).toEqual({
      partners: "Catalog_Контрагенты",
      contracts: "Catalog_ДоговорыКонтрагентов",
      defaultPartnerContracts: "InformationRegister_ОсновныеДоговорыКонтрагента",
      priceTypes: "Catalog_ВидыЦен",
    });
    expect(ONE_C_DEFAULT_PARTNER_CONTRACT_FIELDS).toEqual([
      "Организация_Key",
      "Контрагент_Key",
      "ВидДоговора",
      "Договор_Key",
    ]);
    expect(ONE_C_PARTNER_FIELDS).toEqual(expect.arrayContaining([
      "НаименованиеПолное",
      "ИНН",
      "Покупатель",
      "Поставщик",
      "Недействителен",
    ]));
    expect(ONE_C_CONTRACT_FIELDS).toEqual(expect.arrayContaining([
      "Owner",
      "Owner_Type",
      "НомерДоговора",
      "ДатаДоговора",
      "ВидДоговора",
      "ВидЦен_Key",
      "ВидЦенКонтрагента_Key",
      "Организация_Key",
      "ДоговорПодписан",
    ]));
    expect(ONE_C_PRICE_TYPE_FIELDS).toEqual(expect.arrayContaining([
      "ВалютаЦены_Key",
      "ЦенаВключаетНДС",
      "ТипВидаЦен",
      "ЦеныАктуальны",
    ]));
  });

  it("contains no known mojibake fragments in production integration sources", async () => {
    const files = await listProductionTypeScriptFiles(integrationRoot);
    const contents = await Promise.all(files.map((file) => readFile(file, "utf8")));

    for (const fragment of mojibakeFragments) {
      expect(contents.some((content) => content.includes(fragment))).toBe(false);
    }
  });
});

const mojibakeFragments = [
  String.fromCharCode(0x0420, 0x0459),
  String.fromCharCode(0x0420, 0x045c),
  String.fromCharCode(0x0420, 0x045f),
  String.fromCharCode(0x0420, 0x040e),
  String.fromCharCode(0x0421, 0x201a),
  String.fromCharCode(0x0421, 0x2039),
  String.fromCharCode(0x0421, 0x040a),
];

async function listProductionTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : listProductionTypeScriptFiles(path);
    }
    return entry.isFile() && path.endsWith(".ts") ? [path] : [];
  }));
  return nested.flat();
}
