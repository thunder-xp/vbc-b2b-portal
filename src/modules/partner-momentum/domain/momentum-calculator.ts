import {
  MOMENTUM_CALCULATION_VERSION,
  type MomentumCalculation,
  type MomentumCalculationInput,
  type MomentumOrderFact,
  type MomentumReason,
  type MomentumStatus,
} from "../types";

const DAY_MS = 86_400_000;
const CONFIRMATION_COUNT = 2;
const DECLINE_STATUSES = new Set<MomentumStatus>([
  "slowing",
  "attention_required",
  "high_risk",
]);

export function calculatePartnerMomentum(input: MomentumCalculationInput): MomentumCalculation {
  const now = new Date(input.now);
  const orders = input.orders
    .filter(isValidOrder)
    .filter((order) => new Date(order.orderedAt).getTime() <= now.getTime())
    .sort((left, right) => new Date(left.orderedAt).getTime() - new Date(right.orderedAt).getTime());
  const dates = uniqueDates(orders);
  const spanDays = dates.length > 1 ? daysBetween(dates[0]!, dates.at(-1)!) : 0;
  const eligible = input.companyActive && orders.length >= 3 && dates.length >= 2 && spanDays >= 60;
  const current = inWindow(orders, now, 60, 0);
  const baseline = inWindow(orders, now, 120, 60);
  const intervals = boundedIntervals(dates);
  const normalInterval = intervals.length ? median(intervals) : null;
  const averageInterval = intervals.length ? round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length, 2) : null;
  const lastOrder = orders.at(-1) ?? null;
  const daysSinceLastOrder = lastOrder ? daysBetween(new Date(lastOrder.orderedAt), now) : null;
  const cycleOverrun = normalInterval && daysSinceLastOrder !== null
    ? round(daysSinceLastOrder / normalInterval, 3)
    : null;
  const monetaryCurrent = moneyByCurrency(current);
  const monetaryBaseline = moneyByCurrency(baseline);
  const currencies = [...new Set([...Object.keys(monetaryCurrent), ...Object.keys(monetaryBaseline)])];
  const primaryCurrency = currencies.length === 1 ? currencies[0]! : null;
  const currentSkuCount = skuCount(current);
  const baselineSkuCount = skuCount(baseline);

  if (!eligible) {
    return baseResult(input, {
      eligibility: input.companyActive ? "insufficient_history" : "excluded",
      status: "insufficient_history",
      rawStatus: "insufficient_history",
      score: null,
      pendingStatus: null,
      pendingCount: 0,
      primaryCurrency,
      multiCurrency: currencies.length > 1,
      lastOrderAt: lastOrder?.orderedAt ?? null,
      normalOrderIntervalDays: normalInterval,
      averageOrderIntervalDays: averageInterval,
      cycleOverrunRatio: cycleOverrun,
      orderCountCurrent: current.length,
      orderCountBaseline: baseline.length,
      unitsCurrent: sumUnits(current),
      unitsBaseline: sumUnits(baseline),
      skuCountCurrent: currentSkuCount,
      skuCountBaseline: baselineSkuCount,
      monetaryCurrent,
      monetaryBaseline,
      reasons: [],
      recoveredOrderId: null,
    });
  }

  const volumeComponent = primaryCurrency
    ? ratioScore(monetaryCurrent[primaryCurrency] ?? 0, monetaryBaseline[primaryCurrency] ?? 0)
    : ratioScore(sumUnits(current), sumUnits(baseline));
  const frequencyComponent = ratioScore(current.length, baseline.length);
  const recencyComponent = cycleOverrun === null ? 60 : clamp(100 / Math.max(1, cycleOverrun), 0, 100);
  const breadthComponent = ratioScore(currentSkuCount, baselineSkuCount);
  const intentComponent = input.intent.activeCart ? 45 : input.intent.templateCount > 0 || input.intent.opportunityCount > 0 ? 75 : 100;
  const score = Math.round(
    volumeComponent * 0.35
    + frequencyComponent * 0.25
    + recencyComponent * 0.2
    + breadthComponent * 0.1
    + intentComponent * 0.1,
  );
  const rawStatus = statusForScore(score);
  const recoveryOrder = newestOrderAfter(orders, input.previous?.calculatedAt ?? null);
  const recovered = Boolean(
    input.previous
    && DECLINE_STATUSES.has(input.previous.status)
    && recoveryOrder
    && score >= 45
    && current.length >= Math.max(1, Math.ceil(baseline.length * 0.5)),
  );
  const transition = recovered
    ? { status: "recovered" as const, pendingStatus: null, pendingCount: 0 }
    : applyHysteresis(rawStatus, score, input.previous);
  const reasons = buildReasons({
    current,
    baseline,
    cycleOverrun,
    monetaryCurrent,
    monetaryBaseline,
    primaryCurrency,
    input,
    recovered,
  });

  return baseResult(input, {
    eligibility: "eligible",
    status: transition.status,
    rawStatus,
    score,
    pendingStatus: transition.pendingStatus,
    pendingCount: transition.pendingCount,
    primaryCurrency,
    multiCurrency: currencies.length > 1,
    lastOrderAt: lastOrder?.orderedAt ?? null,
    normalOrderIntervalDays: normalInterval,
    averageOrderIntervalDays: averageInterval,
    cycleOverrunRatio: cycleOverrun,
    orderCountCurrent: current.length,
    orderCountBaseline: baseline.length,
    unitsCurrent: sumUnits(current),
    unitsBaseline: sumUnits(baseline),
    skuCountCurrent: currentSkuCount,
    skuCountBaseline: baselineSkuCount,
    monetaryCurrent,
    monetaryBaseline,
    reasons,
    recoveredOrderId: recovered ? recoveryOrder?.id ?? null : null,
  });
}

function applyHysteresis(rawStatus: MomentumStatus, score: number, previous: MomentumCalculationInput["previous"]) {
  if (!previous || previous.status === "insufficient_history" || previous.status === "recovered") {
    return { status: rawStatus, pendingStatus: null, pendingCount: 0 };
  }
  const retained = retainedStatus(previous.status, score);
  if (retained) return { status: retained, pendingStatus: null, pendingCount: 0 };
  if (rawStatus === previous.status) return { status: rawStatus, pendingStatus: null, pendingCount: 0 };
  if (rawStatus === "high_risk" && score < 15) return { status: rawStatus, pendingStatus: null, pendingCount: 0 };
  const pendingCount = previous.pendingStatus === rawStatus ? previous.pendingCount + 1 : 1;
  return pendingCount >= CONFIRMATION_COUNT
    ? { status: rawStatus, pendingStatus: null, pendingCount: 0 }
    : { status: previous.status, pendingStatus: rawStatus, pendingCount };
}

function retainedStatus(previous: MomentumStatus, score: number): MomentumStatus | null {
  if (previous === "slowing" && score < 65 && score >= 40) return "slowing";
  if (previous === "attention_required" && score < 45 && score >= 20) return "attention_required";
  if (previous === "high_risk" && score < 25) return "high_risk";
  return null;
}

function buildReasons(input: {
  current: MomentumOrderFact[];
  baseline: MomentumOrderFact[];
  cycleOverrun: number | null;
  monetaryCurrent: Record<string, number>;
  monetaryBaseline: Record<string, number>;
  primaryCurrency: string | null;
  input: MomentumCalculationInput;
  recovered: boolean;
}): MomentumReason[] {
  if (input.recovered) return [{ code: "recovered_after_order", value: null }];
  const reasons: MomentumReason[] = [];
  const frequencyChange = percentChange(input.current.length, input.baseline.length);
  if (!input.current.length) reasons.push({ code: "no_orders_in_current_window", value: 0 });
  if (frequencyChange !== null && frequencyChange <= -15) reasons.push({ code: "order_frequency_down", value: frequencyChange });
  if (input.cycleOverrun !== null && input.cycleOverrun >= 1.25) reasons.push({ code: "purchase_cycle_overdue", value: input.cycleOverrun });
  const breadthChange = percentChange(skuCount(input.current), skuCount(input.baseline));
  if (breadthChange !== null && breadthChange <= -20) reasons.push({ code: "assortment_breadth_down", value: breadthChange });
  if (input.primaryCurrency) {
    const volumeChange = percentChange(input.monetaryCurrent[input.primaryCurrency] ?? 0, input.monetaryBaseline[input.primaryCurrency] ?? 0);
    if (volumeChange !== null && volumeChange <= -15) reasons.push({ code: "order_volume_down", value: volumeChange });
  }
  if (input.input.intent.activeCart) reasons.push({ code: "active_cart_not_converted", value: null });
  if (input.input.intent.templateCount > 0) reasons.push({ code: "template_not_used", value: input.input.intent.templateCount });
  if (input.input.intent.opportunityCount > 0) reasons.push({ code: "price_opportunity_available", value: input.input.intent.opportunityCount });
  if (input.input.intent.campaignCount > 0) reasons.push({ code: "campaign_available", value: input.input.intent.campaignCount });
  return reasons.slice(0, 10);
}

function baseResult(input: MomentumCalculationInput, values: Omit<MomentumCalculation, "companyId" | "calculationVersion" | "calculatedAt" | "sourceFingerprint">): MomentumCalculation {
  return { companyId: input.companyId, calculationVersion: MOMENTUM_CALCULATION_VERSION, calculatedAt: input.now, sourceFingerprint: input.sourceFingerprint, ...values };
}

function statusForScore(score: number): MomentumStatus {
  if (score >= 80) return "growth";
  if (score >= 60) return "stable";
  if (score >= 40) return "slowing";
  if (score >= 20) return "attention_required";
  return "high_risk";
}

function boundedIntervals(dates: Date[]): number[] {
  const values = dates.slice(1).map((date, index) => daysBetween(dates[index]!, date)).filter((value) => value > 0);
  if (values.length < 4) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const lower = percentile(sorted, 0.1);
  const upper = percentile(sorted, 0.9);
  return values.map((value) => clamp(value, lower, upper));
}

function inWindow(orders: MomentumOrderFact[], now: Date, startDaysAgo: number, endDaysAgo: number): MomentumOrderFact[] {
  const start = now.getTime() - startDaysAgo * DAY_MS;
  const end = now.getTime() - endDaysAgo * DAY_MS;
  return orders.filter((order) => {
    const time = new Date(order.orderedAt).getTime();
    return time > start && time <= end;
  });
}

function moneyByCurrency(orders: MomentumOrderFact[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const order of orders) {
    if (!order.currency) continue;
    totals[order.currency] = round((totals[order.currency] ?? 0) + order.total, 4);
  }
  return totals;
}

function ratioScore(current: number, baseline: number): number {
  if (baseline <= 0) return current > 0 ? 100 : 50;
  return clamp((current / baseline) * 100, 0, 100);
}

function percentChange(current: number, baseline: number): number | null {
  return baseline > 0 ? round(((current - baseline) / baseline) * 100, 1) : null;
}

function skuCount(orders: MomentumOrderFact[]): number {
  return new Set(orders.flatMap((order) => order.productIds)).size;
}

function sumUnits(orders: MomentumOrderFact[]): number {
  return round(orders.reduce((sum, order) => sum + order.units, 0), 3);
}

function newestOrderAfter(orders: MomentumOrderFact[], date: string | null): MomentumOrderFact | null {
  if (!date) return null;
  const threshold = new Date(date).getTime();
  return [...orders].reverse().find((order) => new Date(order.orderedAt).getTime() > threshold) ?? null;
}

function uniqueDates(orders: MomentumOrderFact[]): Date[] {
  return [...new Set(orders.map((order) => order.orderedAt.slice(0, 10)))].map((value) => new Date(`${value}T00:00:00.000Z`));
}

function isValidOrder(order: MomentumOrderFact): boolean {
  return Number.isFinite(new Date(order.orderedAt).getTime()) && Number.isFinite(order.total) && Number.isFinite(order.units) && order.total >= 0 && order.units >= 0;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return round(sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2, 2);
}

function percentile(sorted: number[], ratio: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))]!;
}

function daysBetween(left: Date, right: Date): number {
  return Math.max(0, round((right.getTime() - left.getTime()) / DAY_MS, 3));
}

function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
