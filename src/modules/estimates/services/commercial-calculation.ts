import Decimal from "decimal.js";

import type { EstimatePricingMode, EstimateVatMode } from "../types";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export class EstimateCalculationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "EstimateCalculationError";
  }
}

export type CommercialLineInput = {
  id: string;
  sectionId: string;
  quantity: number;
  pricingMode: EstimatePricingMode;
  pricingInputValue: number | null;
  convertedCostUnitPrice: number | null;
  lineDiscountPercent: number;
};

export type CommercialSectionInput = {
  id: string;
  discountPercent: number;
};

export type CommercialChargeInput = {
  amount: number;
  vatApplicable: boolean;
};

export type CalculatedCommercialLine = {
  id: string;
  sellingUnitPrice: number | null;
  lineSubtotal: number | null;
  lineDiscountAmount: number | null;
  lineTotal: number | null;
  markupPercent: number | null;
  marginPercent: number | null;
  incomplete: boolean;
};

export type EstimateCommercialTotals = {
  lines: CalculatedCommercialLine[];
  sectionTotals: Array<{ id: string; subtotal: number; discountAmount: number; total: number }>;
  subtotal: number;
  lineDiscountTotal: number;
  sectionDiscountTotal: number;
  globalSubtotal: number;
  globalDiscountAmount: number;
  chargesTotal: number;
  vatBase: number;
  vatAmount: number;
  totalExcludingVat: number;
  finalTotal: number;
  grossProfit: number | null;
  overallMarginPercent: number | null;
  incompletePricing: boolean;
};

export function calculateEstimateCommercials(input: {
  lines: CommercialLineInput[];
  sections: CommercialSectionInput[];
  charges: CommercialChargeInput[];
  globalDiscountPercent: number;
  vatMode: EstimateVatMode;
  vatRatePercent: number;
}): EstimateCommercialTotals {
  const globalDiscount = percentage(input.globalDiscountPercent, "Глобальная скидка должна быть от 0 до 100%.");
  const vatRate = percentage(input.vatRatePercent, "Ставка НДС должна быть от 0 до 100%.");
  const sectionById = new Map(input.sections.map((section) => [section.id, percentage(section.discountPercent, "Скидка раздела должна быть от 0 до 100%.")]));
  const lines = input.lines.map(calculateCommercialLine);
  const lineSectionById = new Map(input.lines.map((line) => [line.id, line.sectionId]));

  const sectionTotals = input.sections.map((section) => {
    const subtotal = sum(lines.filter((line) => lineSectionById.get(line.id) === section.id).map((line) => line.lineTotal ?? 0));
    const discountAmount = money(subtotal.mul(sectionById.get(section.id) ?? 0).div(100));
    return { id: section.id, subtotal: number(subtotal), discountAmount: number(discountAmount), total: number(money(subtotal.minus(discountAmount))) };
  });

  const subtotal = sum(lines.map((line) => line.lineSubtotal ?? 0));
  const lineDiscountTotal = sum(lines.map((line) => line.lineDiscountAmount ?? 0));
  const afterSections = sum(sectionTotals.map((section) => section.total));
  const sectionDiscountTotal = sum(sectionTotals.map((section) => section.discountAmount));
  const globalDiscountAmount = money(afterSections.mul(globalDiscount).div(100));
  const globalSubtotal = money(afterSections.minus(globalDiscountAmount));
  const chargesTotal = sum(input.charges.map((charge) => nonNegative(charge.amount, "Сумма начисления некорректна.")));
  const taxableCharges = sum(input.charges.filter((charge) => charge.vatApplicable).map((charge) => charge.amount));
  const beforeVat = money(globalSubtotal.plus(chargesTotal));
  const taxableBase = money(globalSubtotal.plus(taxableCharges));

  let vatAmount = new Decimal(0);
  let excludingVat = beforeVat;
  let finalTotal = beforeVat;
  if (input.vatMode === "included" && vatRate.gt(0)) {
    vatAmount = money(taxableBase.minus(taxableBase.div(new Decimal(1).plus(vatRate.div(100)))));
    excludingVat = money(beforeVat.minus(vatAmount));
  } else if (input.vatMode === "separate" && vatRate.gt(0)) {
    vatAmount = money(taxableBase.mul(vatRate).div(100));
    finalTotal = money(beforeVat.plus(vatAmount));
  }

  const hasMissingCost = input.lines.some((line) => line.convertedCostUnitPrice === null);
  const totalCost = sum(input.lines.map((line) => {
    const cost = line.convertedCostUnitPrice === null ? new Decimal(0) : nonNegative(line.convertedCostUnitPrice, "Себестоимость некорректна.");
    return cost.mul(positive(line.quantity, "Количество должно быть больше нуля."));
  }));
  const grossProfit = hasMissingCost ? null : money(excludingVat.minus(totalCost));
  const overallMargin = grossProfit !== null && excludingVat.gt(0) ? percentValue(grossProfit.div(excludingVat).mul(100)) : null;

  return {
    lines,
    sectionTotals,
    subtotal: number(money(subtotal)),
    lineDiscountTotal: number(money(lineDiscountTotal)),
    sectionDiscountTotal: number(money(sectionDiscountTotal)),
    globalSubtotal: number(globalSubtotal),
    globalDiscountAmount: number(globalDiscountAmount),
    chargesTotal: number(money(chargesTotal)),
    vatBase: number(taxableBase),
    vatAmount: number(vatAmount),
    totalExcludingVat: number(excludingVat),
    finalTotal: number(finalTotal),
    grossProfit: grossProfit === null ? null : number(grossProfit),
    overallMarginPercent: overallMargin,
    incompletePricing: lines.some((line) => line.incomplete),
  };
}

export function calculateCommercialLine(line: CommercialLineInput): CalculatedCommercialLine {
  const quantity = positive(line.quantity, "Количество должно быть больше нуля.");
  const discount = percentage(line.lineDiscountPercent, "Скидка строки должна быть от 0 до 100%.");
  const input = line.pricingInputValue === null ? null : nonNegative(line.pricingInputValue, "Коммерческое значение некорректно.");
  const cost = line.convertedCostUnitPrice === null ? null : nonNegative(line.convertedCostUnitPrice, "Себестоимость некорректна.");
  let selling: Decimal | null = null;

  if (line.pricingMode === "direct") selling = input;
  if (line.pricingMode === "markup") {
    if (!cost || cost.lte(0)) throw new EstimateCalculationError("MISSING_COST", "Нет исходной цены для расчёта.");
    selling = input === null ? null : cost.mul(new Decimal(1).plus(input.div(100)));
  }
  if (line.pricingMode === "margin") {
    if (!cost || cost.lte(0)) throw new EstimateCalculationError("MISSING_COST", "Нет исходной цены для расчёта.");
    if (input?.gte(100)) throw new EstimateCalculationError("INVALID_MARGIN", "Маржа должна быть меньше 100%.");
    selling = input === null ? null : cost.div(new Decimal(1).minus(input.div(100)));
  }

  if (selling === null) return { id: line.id, sellingUnitPrice: null, lineSubtotal: null, lineDiscountAmount: null, lineTotal: null, markupPercent: null, marginPercent: null, incomplete: true };
  selling = money(selling);
  const subtotal = money(selling.mul(quantity));
  const discountAmount = money(subtotal.mul(discount).div(100));
  const total = money(subtotal.minus(discountAmount));
  const markup = cost?.gt(0) ? percentValue(selling.minus(cost).div(cost).mul(100)) : null;
  const margin = selling.gt(0) && cost !== null ? percentValue(selling.minus(cost).div(selling).mul(100)) : null;
  return {
    id: line.id,
    sellingUnitPrice: number(selling),
    lineSubtotal: number(subtotal),
    lineDiscountAmount: number(discountAmount),
    lineTotal: number(total),
    markupPercent: markup,
    marginPercent: margin,
    incomplete: false,
  };
}

export function resolveCurrencyRate(sourceCurrency: string, targetCurrency: string, mdlPerUsd: number): number {
  if (sourceCurrency === targetCurrency) return 1;
  const rate = positive(mdlPerUsd, "Курс валюты недоступен.");
  if (sourceCurrency === "USD" && targetCurrency === "MDL") return number(rate.toDecimalPlaces(8));
  if (sourceCurrency === "MDL" && targetCurrency === "USD") return number(new Decimal(1).div(rate).toDecimalPlaces(8));
  throw new EstimateCalculationError("UNSUPPORTED_CURRENCY", "Для выбранной валюты нет опубликованного курса.");
}

export function convertMoney(amount: number, rate: number): number {
  return number(money(nonNegative(amount, "Сумма для конвертации некорректна.").mul(positive(rate, "Курс валюты недоступен."))));
}

function percentage(value: number, message: string): Decimal {
  const result = finite(value, message);
  if (result.lt(0) || result.gte(100)) throw new EstimateCalculationError("INVALID_PERCENTAGE", message);
  return result;
}

function positive(value: number, message: string): Decimal {
  const result = finite(value, message);
  if (result.lte(0)) throw new EstimateCalculationError("INVALID_NUMBER", message);
  return result;
}

function nonNegative(value: number, message: string): Decimal {
  const result = finite(value, message);
  if (result.lt(0)) throw new EstimateCalculationError("INVALID_NUMBER", message);
  return result;
}

function finite(value: number, message: string): Decimal {
  try {
    const result = new Decimal(value);
    if (!result.isFinite()) throw new Error();
    return result;
  } catch {
    throw new EstimateCalculationError("INVALID_NUMBER", message);
  }
}

function sum(values: Array<number | Decimal>): Decimal {
  return Decimal.sum(0, ...values);
}

function money(value: Decimal): Decimal {
  const rounded = value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (rounded.abs().gt("9999999999999999.99")) throw new EstimateCalculationError("TOTAL_OVERFLOW", "Итоговая сумма слишком велика.");
  return rounded;
}

function percentValue(value: Decimal): number {
  return number(value.toDecimalPlaces(4, Decimal.ROUND_HALF_UP));
}

function number(value: Decimal): number {
  return value.toNumber();
}
