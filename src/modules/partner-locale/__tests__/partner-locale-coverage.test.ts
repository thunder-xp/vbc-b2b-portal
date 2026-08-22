import { describe, expect, it } from "vitest";

import {
  companyCopy,
  documentsCopy,
  getCatalogCopy,
  getEstimatesCopy,
  getFinanceCopy,
  getOrdersCopy,
  getProposalGeneratorCopy,
  installationCopy,
  notificationCopy,
  partnerDictionary,
  platformCopy,
  procurementCopy,
  projectCopy,
  secondaryCopy,
  serviceCopy,
  serviceFormCopy,
  supportCopy,
  supportFormCopy,
  workspaceCopy,
} from "..";

const copyDomains = [
  companyCopy,
  documentsCopy,
  getCatalogCopy,
  getEstimatesCopy,
  getFinanceCopy,
  getOrdersCopy,
  getProposalGeneratorCopy,
  installationCopy,
  notificationCopy,
  platformCopy,
  procurementCopy,
  projectCopy,
  secondaryCopy,
  serviceCopy,
  serviceFormCopy,
  supportCopy,
  supportFormCopy,
  workspaceCopy,
] as const;

describe("partner locale coverage", () => {
  it("keeps every typed RU/RO domain complete and non-empty", () => {
    for (const getCopy of copyDomains) {
      const ru = getCopy("ru");
      const ro = getCopy("ro");
      expect(Object.keys(ro)).toEqual(Object.keys(ru));
      expect(Object.values(ro).every((value) => value.trim().length > 0)).toBe(true);
    }
  });

  it("keeps the canonical shell dictionary complete", () => {
    const ru = partnerDictionary("ru");
    const ro = partnerDictionary("ro");
    expect(Object.keys(ro)).toEqual(Object.keys(ru));
    expect(Object.values(ro).every((value) => value.trim().length > 0)).toBe(true);
  });

  it("keeps checkout payment guidance exact in RU and RO", () => {
    expect(getOrdersCopy("ru")).toMatchObject({
      paymentDateRequired: "Укажите дату оплаты.",
      cashlessUnavailable: "Нет активного договора для безналичной оплаты.",
      cashUnavailable: "Нет активного договора для наличной оплаты.",
    });
    expect(getOrdersCopy("ro")).toMatchObject({
      paymentDateRequired: "Selectați data plății.",
      cashlessUnavailable: "Nu există un contract activ pentru plata prin transfer bancar.",
      cashUnavailable: "Nu există un contract activ pentru plata în numerar.",
    });
  });
});
