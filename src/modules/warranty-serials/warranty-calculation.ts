export function addCalendarMonthsClamped(start: string, months: number): string {
  const [year, month, day] = start.split("-").map(Number);
  if (!year || !month || !day || !Number.isInteger(months) || months < 0) throw new Error("Invalid warranty period.");
  const monthIndex = year * 12 + month - 1 + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex % 12;
  const finalDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(Math.min(day, finalDay)).padStart(2, "0")}`;
}

export function deriveWarrantyState(input: {
  posted: boolean;
  deleted: boolean;
  companyMapped: boolean;
  productMapped: boolean;
  warrantyMonths: number | null;
  reversalScanComplete: boolean;
  returned: boolean;
  conflict: boolean;
  saleDate: string;
  businessDate: string;
}) {
  if (input.conflict) return { state: "conflict", endDate: null } as const;
  if (!input.posted || input.deleted) return { state: "cancelled", endDate: null } as const;
  if (input.returned) return { state: "returned", endDate: null } as const;
  if (!input.companyMapped || !input.productMapped) return { state: "source_incomplete", endDate: null } as const;
  if (!input.warrantyMonths || input.warrantyMonths < 1) return { state: "warranty_period_missing", endDate: null } as const;
  const endDate = addCalendarMonthsClamped(input.saleDate, input.warrantyMonths);
  if (!input.reversalScanComplete) return { state: "sale_confirmed_review_required", endDate } as const;
  return { state: input.businessDate <= endDate ? "covered" : "expired", endDate } as const;
}
