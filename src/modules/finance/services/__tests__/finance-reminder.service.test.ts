import { describe, expect, it, vi } from "vitest";

import type { FinanceRepository } from "../../repositories";
import type { FinanceReminderCandidate, PartnerPaymentObligation } from "../../types";
import {
  FINANCE_REMINDER_CTA_TARGET,
  FINANCE_REMINDER_OUTBOUND_MODE,
  FINANCE_REMINDER_SMS_ENABLED,
  FinanceReminderDryRunService,
  projectFinanceReminders,
  reminderMilestone,
  ruPlural,
} from "../finance-reminder.service";

const context = {
  sender: { fromName: "Novotech Systems", fromEmail: "office@example.test" },
  applicationOrigin: "https://portal.example.test",
};

describe("FINANCE_REMINDER_V1", () => {
  it.each([
    ["2026-09-13", "D-7"], ["2026-09-09", "D-3"], ["2026-09-06", "D0"],
    ["2026-09-05", "D+1"], ["2026-09-03", "D+3"], ["2026-08-30", "D+7"],
    ["2026-08-23", "WEEKLY_D+14"], ["2026-08-24", null],
  ])("maps due date %s to internal milestone %s", (dueDate, expected) => {
    expect(reminderMilestone("2026-09-06", dueDate)).toBe(expected);
  });

  it("aggregates by company while rendering email, compact in-app, and SMS-specific content", () => {
    const result = project([
      candidate({ id: id(1), currency: "MDL", remainingAmount: "100.00" }),
      candidate({ id: id(2), oneCOrderId: id(22), currency: "USD", remainingAmount: "20.00" }),
    ]);
    const email = channel(result, "email");
    const inApp = channel(result, "in_app");
    const sms = channel(result, "sms_future");
    expect(result.projections).toHaveLength(3);
    expect(email).toMatchObject({
      totalsByCurrency: { MDL: "100.00", USD: "20.00" },
      fromName: "Novotech Systems",
      fromEmail: "office@example.test",
      ctaTarget: FINANCE_REMINDER_CTA_TARGET,
      timingStates: ["DUE_TODAY"],
    });
    expect(inApp.contentPayload).toMatchObject({ kind: "finance_reminder_in_app", ctaTarget: "/cabinet/finance" });
    expect(sms.contentPayload).toMatchObject({ kind: "finance_reminder_sms_preview", smsEnabled: false });
    expect(inApp.body).not.toContain("Заказ CO-1");
    expect(sms.body).not.toBe(email.body);
    expect(new Set(result.projections.map((row) => row.deliveryIdentity)).size).toBe(3);
    expect(new Set(result.projections.map((row) => row.fingerprint)).size).toBe(3);
  });

  it("separates overdue, due-today, and upcoming obligations without exposing milestone codes", () => {
    const result = project([
      candidate({ id: id(1), orderNumber: "NSUU-OVERDUE", dueDate: "2026-09-05" }),
      candidate({ id: id(2), oneCOrderId: id(22), orderNumber: "NSUU-TODAY", dueDate: "2026-09-06" }),
      candidate({ id: id(3), oneCOrderId: id(23), orderNumber: "NSUU-UPCOMING", dueDate: "2026-09-09" }),
    ]);
    const email = channel(result, "email");
    expect(email.timingStates).toEqual(["OVERDUE", "DUE_TODAY", "UPCOMING"]);
    expect(email.subject).toBe("Платежи требуют внимания — Novotech");
    expect(email.body).toContain("Просрочено");
    expect(email.body).toContain("Сегодня к оплате");
    expect(email.body).toContain("Ближайшие платежи");
    expect(email.body).toContain("NSUU-OVERDUE");
    expect(email.body).toContain("NSUU-TODAY");
    expect(email.body).toContain("NSUU-UPCOMING");
    expect(email.body).not.toMatch(/D-3|D\+1|D0|WEEKLY_/);
  });

  it("uses remaining amount as the commercial emphasis for partial obligations", () => {
    const email = channel(project([candidate({
      paymentStatus: "PARTIAL", plannedAmount: "1000", paidAmount: "750", remainingAmount: "250",
    })]), "email");
    expect(email.body).toContain("оплачено 750,00 MDL; осталось 250,00 MDL");
    expect(email.body).not.toContain("1 000,00 MDL");
    expect(email.contentPayload).toMatchObject({
      sections: [expect.objectContaining({ orders: [expect.objectContaining({ remainingAmount: "250", paidAmount: "750" })] })],
    });
  });

  it.each([
    [1, "платёж", "день", "заказ"],
    [2, "платежа", "дня", "заказа"],
    [5, "платежей", "дней", "заказов"],
    [21, "платёж", "день", "заказ"],
    [12, "платежей", "дней", "заказов"],
  ])("pluralizes RU counts for %i", (value, payment, day, order) => {
    expect(ruPlural(value, "платёж", "платежа", "платежей")).toBe(payment);
    expect(ruPlural(value, "день", "дня", "дней")).toBe(day);
    expect(ruPlural(value, "заказ", "заказа", "заказов")).toBe(order);
  });

  it("renders professional RO mixed and partial-payment content", () => {
    const email = channel(project([
      candidate({ dueDate: "2026-09-05", paymentStatus: "PARTIAL", paidAmount: "40", remainingAmount: "60" }, { locale: "ro" }),
      candidate({ id: id(2), oneCOrderId: id(22), dueDate: "2026-09-09" }, { locale: "ro" }),
    ]), "email");
    expect(email.subject).toBe("Plăți care necesită atenție — Novotech");
    expect(email.body).toContain("Plăți restante");
    expect(email.body).toContain("Plăți viitoare");
    expect(email.body).toContain("achitat 40,00 MDL; sold rămas 60,00 MDL");
    expect(email.body).toContain("Deschideți calendarul de plăți: https://portal.example.test/cabinet/finance");
  });

  it("renders the 371-day LEOTECHNOLOGY legacy obligation strictly as overdue", () => {
    const email = channel(project([candidate({
      oneCOrderId: id(1837), orderNumber: "NSUU-001837", dueDate: "2025-08-31", remainingAmount: "14908",
    }, { companyName: "LEOTECHNOLOGY S.R.L." })]), "email");
    expect(email.subject).toContain("Просроченные");
    expect(email.body).toContain("NSUU-001837");
    expect(email.body).toContain("14 908,00 MDL");
    expect(email.body).toContain("просрочено на 371 день");
    expect(email.body).not.toContain("наступает");
  });

  it("renders the authoritative COMPLEX and INNOVA reviewed state distinctions", () => {
    const complex = channel(project([
      candidate({ orderNumber: "NSUU-002434", dueDate: "2026-09-05", remainingAmount: "1681" }, { companyName: "COMPLEX-IT HARDWARE" }),
      candidate({ id: id(2), oneCOrderId: id(22), orderNumber: "NSUU-002325", dueDate: "2026-09-09", remainingAmount: "2895" }, { companyName: "COMPLEX-IT HARDWARE" }),
    ]), "email");
    expect(complex.body).toContain("NSUU-002434 — срок 05.09.2026, просрочено на 1 день");
    expect(complex.body).toContain("NSUU-002325 — срок 09.09.2026, через 3 дня");

    const innova = channel(project([
      candidate({ orderNumber: "NSUU-001933", dueDate: "2026-07-26", remainingAmount: "8898" }, { companyName: "INNOVA SECURITY" }),
      candidate({ id: id(2), oneCOrderId: id(22), orderNumber: "NSUU-002385", dueDate: "2026-09-06", remainingAmount: "25313" }, { companyName: "INNOVA SECURITY" }),
    ]), "email");
    expect(innova.body).toContain("просрочено на 42 дня");
    expect(innova.body).toContain("NSUU-002385 — срок сегодня");
  });

  it.each([
    [{ paymentStatus: "SETTLED", remainingAmount: "0" }, "SETTLED"],
    [{ paymentStatus: "OPEN", remainingAmount: "0" }, "NO_OUTSTANDING_BALANCE"],
    [{ reconciliationStatus: "UNSUPPORTED" }, "UNSUPPORTED_OBLIGATION"],
    [{ reconciliationStatus: "NON_RECONCILING" }, "NON_RECONCILING"],
  ] as const)("suppresses ineligible obligation truth", (change, reason) => {
    const result = project([candidate(change as Partial<PartnerPaymentObligation>)]);
    expect(result.projections).toEqual([]);
    expect(result.suppressions).toEqual([expect.objectContaining({ reason })]);
  });

  it("keeps historical dry runs outside LIVE idempotency and suppresses only an actual delivery receipt", async () => {
    const projected = project([candidate()]);
    const deliveredEmail = channel(projected, "email").deliveryIdentity;
    const repository = {
      getReminderDryRunInput: vi.fn().mockResolvedValue([candidate()]),
      listDeliveredReminderIdentities: vi.fn().mockResolvedValue([deliveredEmail]),
    } as unknown as FinanceRepository;
    const review = await new FinanceReminderDryRunService(
      repository,
      () => new Date("2026-09-06T10:00:00Z"),
      () => context,
    ).currentLiveEligibleReview();
    expect(review.projections.map((row) => row.channel).sort()).toEqual(["in_app", "sms_future"]);
    expect(review.suppressions).toContainEqual(expect.objectContaining({ reason: "DUPLICATE" }));
    expect(repository.listDeliveredReminderIdentities).toHaveBeenCalledWith(expect.arrayContaining([deliveredEmail]));
  });

  it("preserves explicit dry-run and SMS-off safety", () => {
    expect(FINANCE_REMINDER_OUTBOUND_MODE).toBe("DRY_RUN");
    expect(FINANCE_REMINDER_SMS_ENABLED).toBe(false);
  });
});

function project(candidates: FinanceReminderCandidate[]) {
  return projectFinanceReminders(candidates, "2026-09-06", context);
}

function channel(result: ReturnType<typeof project>, name: "email" | "in_app" | "sms_future") {
  return result.projections.find((projection) => projection.channel === name)!;
}

function id(value: number): string {
  return value.toString().padStart(8, "0") + "-0000-4000-8000-000000000001";
}

function candidate(
  obligationChange: Partial<PartnerPaymentObligation & { reconciliationFingerprint: string }> = {},
  candidateChange: Partial<FinanceReminderCandidate> = {},
): FinanceReminderCandidate {
  const obligation = {
    id: id(1), companyId: id(30), oneCOrderId: id(20), orderNumber: "CO-1", orderDate: "2026-09-01",
    oneCCounterpartyId: null, oneCContractId: null, oneCOrganizationId: null, scheduleLineNumber: 1,
    sourceOrderDataVersion: "v1", paymentPercent: "100", plannedAmount: "100", vatAmount: "16.67",
    currency: "MDL", dueDate: "2026-09-06", paymentMethod: "bank", bankAccountId: null,
    bankAccountName: null, paidAmount: "0", remainingAmount: "100", paymentStatus: "OPEN" as const,
    settlementLastPaymentAt: null, orderPosted: true, orderDeletionMark: false, orderStatus: null,
    reconciliationStatus: "READY" as const, unsupportedReason: null, sourceModifiedAt: null,
    sourceObservedAt: "2026-09-06T07:00:00Z", syncedAt: "2026-09-06T07:00:00Z",
    reconciliationFingerprint: "source-fingerprint",
    ...obligationChange,
  };
  return {
    obligation, companyName: "Test Company", financeDataFresh: true,
    recipientUserId: id(40), recipientEmail: "finance@example.test",
    recipientRole: "partner_accounting", locale: "ru", ...candidateChange,
  };
}
