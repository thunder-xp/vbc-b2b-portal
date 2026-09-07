import "server-only";

import { createHash } from "node:crypto";
import Decimal from "decimal.js";

import {
  getCanonicalApplicationOrigin,
  getSmtpSenderIdentity,
  type SmtpSenderIdentity,
} from "@/src/lib/email/runtime-email-config";

import type { FinanceRepository } from "../repositories";
import type {
  FinanceReminderCandidate,
  FinanceReminderChannel,
  FinanceReminderCurrentLiveEligibleReview,
  FinanceReminderDryRun,
  FinanceReminderProjection,
  FinanceReminderSuppression,
  FinanceReminderTiming,
} from "../types";

export const FINANCE_REMINDER_POLICY_VERSION = "FINANCE_REMINDER_V1" as const;
export const FINANCE_REMINDER_OUTBOUND_MODE = "DRY_RUN" as const;
export const FINANCE_REMINDER_SMS_ENABLED = false as const;
export const FINANCE_REMINDER_CTA_TARGET = "/cabinet/finance" as const;

type Eligible = FinanceReminderCandidate & {
  milestone: string;
  timing: FinanceReminderTiming;
  daysFromDue: number;
};

export type FinanceReminderRenderContext = {
  sender: SmtpSenderIdentity;
  applicationOrigin: string;
};

export class FinanceReminderDryRunService {
  constructor(
    private readonly repository: FinanceRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly renderContext: () => FinanceReminderRenderContext = runtimeRenderContext,
  ) {}

  async run(): Promise<FinanceReminderDryRun> {
    const startedAt = performance.now();
    const review = await this.currentLiveEligibleReview();
    return this.repository.publishReminderDryRun({
      businessDate: review.businessDate,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      projections: review.projections,
      suppressions: review.suppressions,
    });
  }

  async currentLiveEligibleReview(): Promise<FinanceReminderCurrentLiveEligibleReview> {
    const businessDate = chisinauBusinessDate(this.now());
    const candidates = await this.repository.getReminderDryRunInput();
    const projected = projectFinanceReminders(candidates, businessDate, this.renderContext());
    const delivered = new Set(await this.repository.listDeliveredReminderIdentities(
      projected.projections.map((projection) => projection.deliveryIdentity),
    ));
    const projections = projected.projections.filter((projection) => !delivered.has(projection.deliveryIdentity));
    const suppressions = [...projected.suppressions];
    for (const projection of projected.projections) {
      if (!delivered.has(projection.deliveryIdentity)) continue;
      for (const obligationId of projection.obligationIds) {
        suppressions.push({ companyId: projection.companyId, obligationId, reason: "DUPLICATE" });
      }
    }
    return toCurrentReview(candidates, businessDate, projections, suppressions);
  }
}

export function projectFinanceReminders(
  candidates: FinanceReminderCandidate[],
  businessDate: string,
  context: FinanceReminderRenderContext,
): { projections: FinanceReminderProjection[]; suppressions: FinanceReminderSuppression[] } {
  const eligible: Eligible[] = [];
  const suppressions: FinanceReminderSuppression[] = [];
  for (const candidate of candidates) {
    const reason = suppressionReason(candidate, businessDate);
    if (reason) {
      suppressions.push({ companyId: candidate.obligation.companyId, obligationId: candidate.obligation.id, reason });
      continue;
    }
    const daysUntilDue = dayDifference(businessDate, candidate.obligation.dueDate);
    eligible.push({
      ...candidate,
      milestone: reminderMilestone(businessDate, candidate.obligation.dueDate)!,
      timing: daysUntilDue > 0 ? "UPCOMING" : daysUntilDue === 0 ? "DUE_TODAY" : "OVERDUE",
      daysFromDue: -daysUntilDue,
    });
  }

  const groups = new Map<string, Eligible[]>();
  for (const item of eligible) groups.set(item.obligation.companyId, [...(groups.get(item.obligation.companyId) ?? []), item]);
  const projections: FinanceReminderProjection[] = [];
  for (const companyItems of groups.values()) {
    const first = companyItems[0];
    if (!first.recipientUserId) {
      for (const item of companyItems) suppressions.push({ companyId: item.obligation.companyId, obligationId: item.obligation.id, reason: "NO_VALID_EMAIL" });
      continue;
    }
    projections.push(toProjection(companyItems, "in_app", businessDate, context));
    projections.push(toProjection(companyItems, "sms_future", businessDate, context));
    if (validEmail(first.recipientEmail)) {
      projections.push(toProjection(companyItems, "email", businessDate, context));
    } else {
      for (const item of companyItems) suppressions.push({ companyId: item.obligation.companyId, obligationId: item.obligation.id, reason: "NO_VALID_EMAIL" });
    }
  }
  return { projections, suppressions };
}

export function reminderMilestone(businessDate: string, dueDate: string): string | null {
  const daysUntilDue = dayDifference(businessDate, dueDate);
  const exact = new Map([[7, "D-7"], [3, "D-3"], [0, "D0"], [-1, "D+1"], [-3, "D+3"], [-7, "D+7"]]);
  const milestone = exact.get(daysUntilDue);
  if (milestone) return milestone;
  const daysOverdue = -daysUntilDue;
  return daysOverdue > 7 && (daysOverdue - 7) % 7 === 0 ? `WEEKLY_D+${daysOverdue}` : null;
}

export function ruPlural(value: number, one: string, few: string, many: string): string {
  const absolute = Math.abs(value) % 100;
  const last = absolute % 10;
  if (absolute > 10 && absolute < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function suppressionReason(candidate: FinanceReminderCandidate, businessDate: string): FinanceReminderSuppression["reason"] | null {
  const obligation = candidate.obligation;
  if (obligation.paymentStatus === "SETTLED") return "SETTLED";
  if (!positive(obligation.remainingAmount)) return "NO_OUTSTANDING_BALANCE";
  if (!candidate.financeDataFresh) return "FINANCE_DATA_STALE";
  if (obligation.reconciliationStatus === "UNSUPPORTED") return "UNSUPPORTED_OBLIGATION";
  if (obligation.reconciliationStatus === "NON_RECONCILING") return "NON_RECONCILING";
  return reminderMilestone(businessDate, obligation.dueDate) ? null : "NOT_IN_REMINDER_WINDOW";
}

function toProjection(
  items: Eligible[],
  channel: FinanceReminderChannel,
  businessDate: string,
  context: FinanceReminderRenderContext,
): FinanceReminderProjection {
  const ordered = [...items].sort((left, right) => left.obligation.dueDate.localeCompare(right.obligation.dueDate) || left.obligation.id.localeCompare(right.obligation.id));
  const first = ordered[0];
  const totalsByCurrency = sumCurrencies(ordered);
  const milestone = [...new Set(ordered.map((item) => item.milestone))].sort().join("+");
  const timingStates = orderedTimingStates(ordered);
  const content = channel === "email"
    ? renderEmail(first.locale, ordered, totalsByCurrency, context.applicationOrigin)
    : channel === "in_app"
      ? renderInApp(first.locale, ordered, totalsByCurrency)
      : renderSms(first.locale, ordered, totalsByCurrency, context.applicationOrigin);
  const identityParts = [
    FINANCE_REMINDER_POLICY_VERSION,
    first.obligation.companyId,
    channel,
    first.recipientUserId,
    channel === "email" ? first.recipientEmail?.trim().toLowerCase() : "",
    ...ordered.flatMap((item) => [item.obligation.oneCOrderId, item.obligation.dueDate, item.milestone, item.obligation.reconciliationFingerprint]),
  ];
  const deliveryIdentity = hash(["LIVE", ...identityParts]);
  const fingerprint = hash(["DRY_RUN", businessDate, deliveryIdentity, content.subject, content.body]);
  return {
    companyId: first.obligation.companyId,
    channel,
    recipientUserId: first.recipientUserId,
    recipientEmail: channel === "email" ? first.recipientEmail : null,
    locale: first.locale,
    milestone,
    timingStates,
    obligationIds: ordered.map((item) => item.obligation.id),
    totalsByCurrency,
    subject: content.subject,
    body: content.body,
    fromName: channel === "email" ? context.sender.fromName : null,
    fromEmail: channel === "email" ? context.sender.fromEmail : null,
    ctaLabel: content.ctaLabel,
    ctaTarget: FINANCE_REMINDER_CTA_TARGET,
    contentPayload: content.payload,
    deliveryIdentity,
    fingerprint,
  };
}

function renderEmail(locale: "ru" | "ro", items: Eligible[], totals: Record<string, string>, applicationOrigin: string) {
  const counts = timingCounts(items);
  const ctaLabel = locale === "ro" ? "Deschideți calendarul de plăți" : "Открыть платёжный календарь";
  const subject = subjectFor(locale, counts, "email");
  const sections = buildSections(locale, items);
  const paymentCount = locale === "ro" ? roCount(items.length, "plată", "plăți") : `${items.length} ${ruPlural(items.length, "платёж", "платежа", "платежей")}`;
  const orderCount = locale === "ro" ? roCount(items.length, "comandă", "comenzi") : `${items.length} ${ruPlural(items.length, "заказ", "заказа", "заказов")}`;
  const intro = locale === "ro"
    ? `Calendarul de plăți: ${paymentCount}, ${orderCount}. Verificați termenele și soldurile curente.`
    : `Платёжный календарь: ${paymentCount}, ${orderCount}. Проверьте актуальные сроки и остатки.`;
  const ctaUrl = new URL(FINANCE_REMINDER_CTA_TARGET, `${applicationOrigin}/`).toString();
  const body = [
    locale === "ro" ? "Bună ziua." : "Здравствуйте.",
    intro,
    ...sections.flatMap((section) => [section.title, ...section.lines]),
    `${ctaLabel}: ${ctaUrl}`,
  ].join("\n\n");
  return {
    subject,
    body,
    ctaLabel,
    payload: { kind: "finance_reminder_email", counts, totalsByCurrency: totals, sections, ctaLabel, ctaTarget: FINANCE_REMINDER_CTA_TARGET, ctaUrl },
  };
}

function renderInApp(locale: "ru" | "ro", items: Eligible[], totals: Record<string, string>) {
  const counts = timingCounts(items);
  const ctaLabel = locale === "ro" ? "Deschide finanțele" : "Открыть финансы";
  const fragments = locale === "ro"
    ? [counts.overdue ? `restante: ${counts.overdue}` : "", counts.dueToday ? `scadente astăzi: ${counts.dueToday}` : "", counts.upcoming ? `viitoare: ${counts.upcoming}` : ""]
    : [counts.overdue ? `просрочено: ${counts.overdue}` : "", counts.dueToday ? `сегодня: ${counts.dueToday}` : "", counts.upcoming ? `ближайшие: ${counts.upcoming}` : ""];
  const body = `${fragments.filter(Boolean).join(", ")}. ${locale === "ro" ? "Sold rămas" : "Остаток"}: ${formatTotals(totals, locale)}.`;
  return {
    subject: subjectFor(locale, counts, "in_app"),
    body,
    ctaLabel,
    payload: { kind: "finance_reminder_in_app", title: subjectFor(locale, counts, "in_app"), body, ctaLabel, ctaTarget: FINANCE_REMINDER_CTA_TARGET, counts, totalsByCurrency: totals },
  };
}

function renderSms(locale: "ru" | "ro", items: Eligible[], totals: Record<string, string>, applicationOrigin: string) {
  const counts = timingCounts(items);
  const ctaLabel = locale === "ro" ? "Detalii" : "Подробнее";
  const ctaUrl = new URL(FINANCE_REMINDER_CTA_TARGET, `${applicationOrigin}/`).toString();
  const states = locale === "ro"
    ? [`restante ${counts.overdue}`, `astăzi ${counts.dueToday}`, `viitoare ${counts.upcoming}`]
    : [`просрочено ${counts.overdue}`, `сегодня ${counts.dueToday}`, `ближайшие ${counts.upcoming}`];
  const body = `Novotech: ${states.join(", ")}. ${locale === "ro" ? "Sold" : "Остаток"} ${formatTotals(totals, locale)}. ${ctaLabel}: ${ctaUrl}`;
  return {
    subject: locale === "ro" ? "Plăți Novotech" : "Платежи Novotech",
    body,
    ctaLabel,
    payload: { kind: "finance_reminder_sms_preview", body, ctaLabel, ctaTarget: FINANCE_REMINDER_CTA_TARGET, ctaUrl, counts, totalsByCurrency: totals, smsEnabled: false },
  };
}

function buildSections(locale: "ru" | "ro", items: Eligible[]) {
  const definitions: Array<{ timing: FinanceReminderTiming; ru: string; ro: string }> = [
    { timing: "OVERDUE", ru: "Просрочено", ro: "Plăți restante" },
    { timing: "DUE_TODAY", ru: "Сегодня к оплате", ro: "Scadente astăzi" },
    { timing: "UPCOMING", ru: "Ближайшие платежи", ro: "Plăți viitoare" },
  ];
  return definitions.flatMap((definition) => {
    const sectionItems = items.filter((item) => item.timing === definition.timing);
    return sectionItems.length ? [{
      timing: definition.timing,
      title: locale === "ro" ? definition.ro : definition.ru,
      lines: sectionItems.map((item) => orderLine(locale, item)),
      orders: sectionItems.map((item) => ({
        orderNumber: item.obligation.orderNumber,
        dueDate: item.obligation.dueDate,
        remainingAmount: item.obligation.remainingAmount,
        paidAmount: item.obligation.paymentStatus === "PARTIAL" ? item.obligation.paidAmount : null,
        currency: item.obligation.currency,
        paymentStatus: item.obligation.paymentStatus,
        timing: item.timing,
        daysFromDue: item.daysFromDue,
      })),
    }] : [];
  });
}

function orderLine(locale: "ru" | "ro", item: Eligible): string {
  const obligation = item.obligation;
  const remaining = `${formatAmount(obligation.remainingAmount, locale)} ${obligation.currency}`;
  const paid = `${formatAmount(obligation.paidAmount, locale)} ${obligation.currency}`;
  const date = formatDate(obligation.dueDate, locale);
  if (locale === "ro") {
    const timing = item.timing === "DUE_TODAY"
      ? "scadentă astăzi"
      : item.timing === "UPCOMING"
        ? `scadentă la ${date}, peste ${roCount(Math.abs(item.daysFromDue), "zi", "zile")}`
        : `scadentă la ${date}, întârziere de ${roCount(item.daysFromDue, "zi", "zile")}`;
    const amount = obligation.paymentStatus === "PARTIAL" ? `achitat ${paid}; sold rămas ${remaining}` : `sold rămas ${remaining}`;
    return `Comanda ${obligation.orderNumber} — ${timing}; ${amount}.`;
  }
  const timing = item.timing === "DUE_TODAY"
    ? "срок сегодня"
    : item.timing === "UPCOMING"
      ? `срок ${date}, через ${Math.abs(item.daysFromDue)} ${ruPlural(Math.abs(item.daysFromDue), "день", "дня", "дней")}`
      : `срок ${date}, просрочено на ${item.daysFromDue} ${ruPlural(item.daysFromDue, "день", "дня", "дней")}`;
  const amount = obligation.paymentStatus === "PARTIAL" ? `оплачено ${paid}; осталось ${remaining}` : `осталось ${remaining}`;
  return `Заказ ${obligation.orderNumber} — ${timing}; ${amount}.`;
}

function subjectFor(locale: "ru" | "ro", counts: ReturnType<typeof timingCounts>, channel: "email" | "in_app") {
  const populated = [counts.overdue, counts.dueToday, counts.upcoming].filter(Boolean).length;
  if (locale === "ro") {
    if (populated > 1) return channel === "email" ? "Plăți care necesită atenție — Novotech" : "Plăți care necesită atenție";
    if (counts.overdue) return channel === "email" ? "Plăți restante — Novotech" : "Aveți plăți restante";
    if (counts.dueToday) return channel === "email" ? "Plăți scadente astăzi — Novotech" : "Plăți scadente astăzi";
    return channel === "email" ? "Plăți viitoare — Novotech" : "Plăți viitoare";
  }
  if (populated > 1) return channel === "email" ? "Платежи требуют внимания — Novotech" : "Платежи требуют внимания";
  if (counts.overdue) return channel === "email" ? "Просроченные платежи — Novotech" : "Есть просроченные платежи";
  if (counts.dueToday) return channel === "email" ? "Платежи на сегодня — Novotech" : "Платежи на сегодня";
  return channel === "email" ? "Ближайшие платежи — Novotech" : "Ближайшие платежи";
}

function toCurrentReview(
  candidates: FinanceReminderCandidate[],
  businessDate: string,
  projections: FinanceReminderProjection[],
  suppressions: FinanceReminderSuppression[],
): FinanceReminderCurrentLiveEligibleReview {
  const inApp = projections.filter((projection) => projection.channel === "in_app");
  const obligationIds = new Set(inApp.flatMap((projection) => projection.obligationIds));
  const eligible = candidates.filter((candidate) => obligationIds.has(candidate.obligation.id));
  const totals = new Map<string, Decimal>();
  const ageing = { upcomingOrDueToday: 0, overdue1To7: 0, overdue8To30: 0, overdue30Plus: 0 };
  for (const candidate of eligible) {
    totals.set(candidate.obligation.currency, (totals.get(candidate.obligation.currency) ?? new Decimal(0)).plus(candidate.obligation.remainingAmount));
    const days = dayDifference(candidate.obligation.dueDate, businessDate);
    if (days <= 0) ageing.upcomingOrDueToday += 1;
    else if (days <= 7) ageing.overdue1To7 += 1;
    else if (days <= 30) ageing.overdue8To30 += 1;
    else ageing.overdue30Plus += 1;
  }
  return {
    businessDate,
    policyVersion: FINANCE_REMINDER_POLICY_VERSION,
    outboundMode: FINANCE_REMINDER_OUTBOUND_MODE,
    smsEnabled: FINANCE_REMINDER_SMS_ENABLED,
    eligibleCompanyCount: new Set(inApp.map((projection) => projection.companyId)).size,
    obligationCount: obligationIds.size,
    totalsByCurrency: Object.fromEntries([...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, total]) => [currency, total.toFixed(2)])),
    ageing,
    projections,
    suppressions,
  };
}

function orderedTimingStates(items: Eligible[]): FinanceReminderTiming[] {
  return (["OVERDUE", "DUE_TODAY", "UPCOMING"] as const).filter((timing) => items.some((item) => item.timing === timing));
}

function timingCounts(items: Eligible[]) {
  return {
    overdue: items.filter((item) => item.timing === "OVERDUE").length,
    dueToday: items.filter((item) => item.timing === "DUE_TODAY").length,
    upcoming: items.filter((item) => item.timing === "UPCOMING").length,
  };
}

function sumCurrencies(items: Eligible[]): Record<string, string> {
  const totals = new Map<string, Decimal>();
  for (const item of items) totals.set(item.obligation.currency, (totals.get(item.obligation.currency) ?? new Decimal(0)).plus(item.obligation.remainingAmount));
  return Object.fromEntries([...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, total]) => [currency, total.toFixed(2)]));
}

function formatTotals(totals: Record<string, string>, locale: "ru" | "ro"): string {
  return Object.entries(totals).map(([currency, value]) => `${formatAmount(value, locale)} ${currency}`).join(", ");
}

function roCount(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`;
}

function runtimeRenderContext(): FinanceReminderRenderContext {
  return { sender: getSmtpSenderIdentity(), applicationOrigin: getCanonicalApplicationOrigin() };
}

function positive(value: string): boolean {
  try { return new Decimal(value).greaterThan(0); } catch { return false; }
}

function validEmail(value: string | null): value is string {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320);
}

function dayDifference(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function chisinauBusinessDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Chisinau" }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function formatAmount(value: string, locale: "ru" | "ro"): string {
  return new Intl.NumberFormat(locale === "ro" ? "ro-MD" : "ru-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
}

function formatDate(value: string, locale: "ru" | "ro"): string {
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-MD" : "ru-MD", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function hash(parts: Array<string | null | undefined>): string {
  return createHash("sha256").update(parts.map((part) => part ?? "").join("|")).digest("hex");
}
