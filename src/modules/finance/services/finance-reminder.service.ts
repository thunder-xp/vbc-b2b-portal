import "server-only";

import { createHash } from "node:crypto";
import Decimal from "decimal.js";

import {
  getCanonicalApplicationOrigin,
  getSmtpSenderIdentity,
  type SmtpSenderIdentity,
} from "@/src/lib/email/runtime-email-config";
import {
  CommunicationGatewayService,
  createFinanceReminderTemplateRegistry,
  FINANCE_PAYMENT_REMINDER_TEMPLATE_KEY,
  FINANCE_PAYMENT_REMINDER_TEMPLATE_VERSION,
  ruPlural,
  type CommunicationChannel,
  type CommunicationIntent,
  type FinancePaymentReminderTemplateVariables,
} from "@/src/modules/notifications/gateway";

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
export const FINANCE_REMINDER_EMAIL_LIVE = false as const;
export const FINANCE_REMINDER_IN_APP_LIVE = false as const;
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

export { ruPlural };

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
  const gatewayChannel: CommunicationChannel = channel === "sms_future" ? "sms" : channel;
  const intentIdentityParts = [
    FINANCE_REMINDER_POLICY_VERSION,
    first.obligation.companyId,
    first.recipientUserId,
    ...ordered.flatMap((item) => [item.obligation.oneCOrderId, item.obligation.dueDate, item.milestone, item.obligation.reconciliationFingerprint]),
  ];
  const intentId = hash(["INTENT", ...intentIdentityParts]);
  const intent: CommunicationIntent<FinancePaymentReminderTemplateVariables> = Object.freeze({
    intentId,
    businessEventType: "finance.payment_reminder",
    businessEntityReferences: Object.freeze(ordered.map((item) => item.obligation.id)),
    companyId: first.obligation.companyId,
    recipient: Object.freeze({
      userId: first.recipientUserId!,
      companyId: first.obligation.companyId,
      locale: first.locale,
      email: first.recipientEmail,
      phone: null,
      identityVerified: true,
      membershipActive: first.recipientRole !== null,
      capabilityAuthorized: first.recipientRole !== null,
    }),
    templateKey: FINANCE_PAYMENT_REMINDER_TEMPLATE_KEY,
    templateVersion: FINANCE_PAYMENT_REMINDER_TEMPLATE_VERSION,
    channelPolicy: Object.freeze({ email: "DRY_RUN", in_app: "DRY_RUN", sms: "DISABLED" }),
    variables: Object.freeze({
      items: Object.freeze(ordered.map((item) => Object.freeze({
        orderNumber: item.obligation.orderNumber,
        dueDate: item.obligation.dueDate,
        remainingAmount: item.obligation.remainingAmount,
        paidAmount: item.obligation.paidAmount,
        plannedAmount: item.obligation.plannedAmount,
        currency: item.obligation.currency,
        paymentStatus: item.obligation.paymentStatus,
        timing: item.timing,
        daysFromDue: item.daysFromDue,
      }))),
      totalsByCurrency: Object.freeze({ ...totalsByCurrency }),
      applicationOrigin: context.applicationOrigin,
    }),
    cta: Object.freeze({ label: first.locale === "ro" ? "Deschide finanțele" : "Открыть финансы", target: FINANCE_REMINDER_CTA_TARGET }),
    priority: "normal",
    scheduledBusinessDate: businessDate,
    correlationId: intentId,
    idempotencyIdentity: hash(intentIdentityParts),
    sensitivity: "FINANCIAL_PRIVATE",
  });
  const projected = new CommunicationGatewayService(createFinanceReminderTemplateRegistry()).project(intent, gatewayChannel);
  const content = projected.rendered!;
  const ctaLabel = typeof content.providerPayload.ctaLabel === "string" ? content.providerPayload.ctaLabel : intent.cta.label;
  const contentPayload = {
    ...content.providerPayload,
    communication: {
      intentId: projected.intentId,
      businessEventType: projected.businessEventType,
      businessEntityReferences: projected.businessEntityReferences,
      channel: projected.channel,
      mode: projected.mode,
      templateKey: projected.templateKey,
      templateVersion: projected.templateVersion,
      locale: projected.locale,
      sensitivity: projected.sensitivity,
      correlationId: projected.correlationId,
      businessIdentity: intent.idempotencyIdentity,
      deliveryIdentity: projected.deliveryIdentity,
      state: projected.state,
      suppressionReason: projected.suppressionReason,
    },
  };
  const fingerprint = hash(["DRY_RUN", businessDate, projected.deliveryIdentity, content.subject, content.textBody]);
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
    body: content.textBody,
    fromName: channel === "email" ? context.sender.fromName : null,
    fromEmail: channel === "email" ? context.sender.fromEmail : null,
    ctaLabel,
    ctaTarget: FINANCE_REMINDER_CTA_TARGET,
    contentPayload,
    deliveryIdentity: projected.deliveryIdentity,
    fingerprint,
  };
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

function sumCurrencies(items: Eligible[]): Record<string, string> {
  const totals = new Map<string, Decimal>();
  for (const item of items) totals.set(item.obligation.currency, (totals.get(item.obligation.currency) ?? new Decimal(0)).plus(item.obligation.remainingAmount));
  return Object.fromEntries([...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, total]) => [currency, total.toFixed(2)]));
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

function hash(parts: Array<string | null | undefined>): string {
  return createHash("sha256").update(parts.map((part) => part ?? "").join("|")).digest("hex");
}
