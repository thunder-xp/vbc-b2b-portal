import { describe, expect, it } from "vitest";
import { getCctvConfigurationDiagnostics, type CctvObjectServiceBinding } from "../cctv-object-configuration";

const service = (overrides: Partial<CctvObjectServiceBinding> = {}): CctvObjectServiceBinding => ({
  bindingId: "10000000-0000-4000-8000-000000000001", serviceCode: "commissioning", family: "commissioning",
  complexityClass: null, label: "Пусконаладка", unitCode: "service", enabled: true, calculatorDefault: true,
  displayOrder: 10, notes: null, version: 1, partnerServiceId: "20000000-0000-4000-8000-000000000001",
  tariffServiceType: "commissioning", tariffActive: true, unitPrice: 250, currency: "MDL", vatTreatment: "included",
  ...overrides,
});

describe("CCTV object configuration diagnostics", () => {
  it("reports actionable pool and service gaps", () => {
    expect(getCctvConfigurationDiagnostics({ indoorCandidates: 0, outdoorCandidates: 1, indoorEligible: 0,
      outdoorEligible: 1, services: [service({ tariffActive: false })] })).toEqual(expect.arrayContaining([
      "Нет кандидатов для камер внутри помещения.",
      "Для улицы доступна одна камера — эконом-вариант отсутствует.",
      "Пусконаладка: нет активного тарифа.",
    ]));
  });

  it("does not report gaps for a complete multi-candidate configuration", () => {
    expect(getCctvConfigurationDiagnostics({ indoorCandidates: 2, outdoorCandidates: 2, indoorEligible: 2,
      outdoorEligible: 2, services: [service()] })).toEqual([]);
  });
});
