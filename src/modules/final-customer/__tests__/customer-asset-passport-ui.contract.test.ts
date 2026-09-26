import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const equipment = readFileSync(resolve("app/account/(private)/equipment/[lineId]/page.tsx"), "utf8");
const objectPage = readFileSync(resolve("app/account/(private)/objects/[objectId]/page.tsx"), "utf8");
const servicePage = readFileSync(resolve("app/account/(private)/service/new/page.tsx"), "utf8");

describe("Customer Asset Passport UI contract", () => {
  it("exposes an opaque passport route from the object and honest RU/RO states", () => {
    expect(objectPage).toContain("/account/equipment/${line.id}");
    expect(equipment).toContain("Паспорт оборудования");
    expect(equipment).toContain("Pașaportul echipamentului");
    expect(equipment).toContain("Покупка не означает, что оборудование установлено");
    expect(equipment).toContain("Achiziția nu înseamnă automat că echipamentul a fost instalat");
    expect(equipment).toContain("Не привязано к объекту");
    expect(equipment).toContain("Neatribuit unui obiect");
  });

  it("does not expose private operational data and prefills known service context", () => {
    expect(equipment).not.toMatch(/internalNote|partner_company_id|provider_id|cost|margin/);
    expect(servicePage).toContain("line.name");
    expect(servicePage).toContain("line.sku");
    expect(servicePage).toContain("defaultSubject={subject}");
  });
});
