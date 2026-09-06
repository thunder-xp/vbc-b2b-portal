import "server-only";

import { createHash } from "node:crypto";
import Decimal from "decimal.js";

import type { FinanceRepository } from "../repositories";
import type {
  FinanceReminderCandidate,
  FinanceReminderChannel,
  FinanceReminderDryRun,
  FinanceReminderProjection,
  FinanceReminderSuppression,
} from "../types";

export const FINANCE_REMINDER_POLICY_VERSION = "FINANCE_REMINDER_V1" as const;
export const FINANCE_REMINDER_OUTBOUND_MODE = "DRY_RUN" as const;
export const FINANCE_REMINDER_SMS_ENABLED = false as const;

type Eligible = FinanceReminderCandidate & { milestone: string };

export class FinanceReminderDryRunService {
  constructor(
    private readonly repository: FinanceRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async run(): Promise<FinanceReminderDryRun> {
    const startedAt = performance.now();
    const businessDate = chisinauBusinessDate(this.now());
    const candidates = await this.repository.getReminderDryRunInput();
    const { projections, suppressions } = projectFinanceReminders(candidates, businessDate);
    return this.repository.publishReminderDryRun({
      businessDate,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      projections,
      suppressions,
    });
  }
}

export function projectFinanceReminders(
  candidates: FinanceReminderCandidate[],
  businessDate: string,
): { projections: FinanceReminderProjection[]; suppressions: FinanceReminderSuppression[] } {
  const eligible: Eligible[] = [];
  const suppressions: FinanceReminderSuppression[] = [];
  for (const candidate of candidates) {
    const reason = suppressionReason(candidate, businessDate);
    if (reason) {
      suppressions.push({ companyId: candidate.obligation.companyId, obligationId: candidate.obligation.id, reason });
      continue;
    }
    eligible.push({ ...candidate, milestone: reminderMilestone(businessDate, candidate.obligation.dueDate)! });
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
    projections.push(toProjection(companyItems, "in_app", businessDate));
    projections.push(toProjection(companyItems, "sms_future", businessDate));
    if (validEmail(first.recipientEmail)) {
      projections.push(toProjection(companyItems, "email", businessDate));
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

function suppressionReason(candidate: FinanceReminderCandidate, businessDate: string): FinanceReminderSuppression["reason"] | null {
  const obligation = candidate.obligation;
  if (obligation.paymentStatus === "SETTLED") return "SETTLED";
  if (!positive(obligation.remainingAmount)) return "NO_OUTSTANDING_BALANCE";
  if (!candidate.financeDataFresh) return "FINANCE_DATA_STALE";
  if (obligation.reconciliationStatus === "UNSUPPORTED") return "UNSUPPORTED_OBLIGATION";
  if (obligation.reconciliationStatus === "NON_RECONCILING") return "NON_RECONCILING";
  return reminderMilestone(businessDate, obligation.dueDate) ? null : "NOT_IN_REMINDER_WINDOW";
}

function toProjection(items: Eligible[], channel: FinanceReminderChannel, businessDate: string): FinanceReminderProjection {
  const ordered = [...items].sort((left, right) => left.obligation.dueDate.localeCompare(right.obligation.dueDate) || left.obligation.id.localeCompare(right.obligation.id));
  const first = ordered[0];
  const totals = new Map<string, Decimal>();
  for (const item of ordered) totals.set(item.obligation.currency, (totals.get(item.obligation.currency) ?? new Decimal(0)).plus(item.obligation.remainingAmount));
  const totalsByCurrency = Object.fromEntries([...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, total]) => [currency, total.toFixed(2)]));
  const milestone = [...new Set(ordered.map((item) => item.milestone))].sort().join("+");
  const locale = first.locale;
  const content = reminderContent(locale, ordered.length, totalsByCurrency, ordered[0].obligation.dueDate, milestone);
  const fingerprint = createHash("sha256").update([
    FINANCE_REMINDER_POLICY_VERSION, first.obligation.companyId, businessDate, milestone, channel,
    ...ordered.flatMap((item) => [item.obligation.oneCOrderId, item.obligation.dueDate, item.obligation.reconciliationFingerprint]),
  ].join("|")).digest("hex");
  return {
    companyId: first.obligation.companyId,
    channel,
    recipientUserId: first.recipientUserId,
    recipientEmail: channel === "email" ? first.recipientEmail : null,
    locale,
    milestone,
    obligationIds: ordered.map((item) => item.obligation.id),
    totalsByCurrency,
    subject: content.subject,
    body: content.body,
    fingerprint,
  };
}

function reminderContent(locale: "ru" | "ro", count: number, totals: Record<string, string>, dueDate: string, milestone: string) {
  const amount = Object.entries(totals).map(([currency, value]) => `${formatAmount(value, locale)} ${currency}`).join(", ");
  const date = new Intl.DateTimeFormat(locale === "ro" ? "ro-MD" : "ru-MD", { dateStyle: "short", timeZone: "UTC" }).format(new Date(`${dueDate}T00:00:00Z`));
  if (locale === "ro") {
    return {
      subject: "Calendarul de plăți Novotech",
      body: count === 1
        ? `Vă reamintim: plata în valoare de ${amount} are termenul ${date}. Verificați situația curentă în cabinetul partenerului.`
        : `Aveți ${count} plăți incluse în fereastra ${milestone}, în valoare totală de ${amount}. Verificați situația curentă în cabinetul partenerului.`,
    };
  }
  return {
    subject: "Платежный календарь Novotech",
    body: count === 1
      ? `Напоминаем: срок оплаты ${amount} наступает ${date}. Проверьте актуальное состояние в партнёрском кабинете.`
      : `В окно ${milestone} включено ${count} платежа на общую сумму ${amount}. Проверьте актуальное состояние в партнёрском кабинете.`,
  };
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
