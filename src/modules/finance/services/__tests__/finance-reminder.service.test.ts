import { describe, expect, it } from "vitest";

import type { FinanceReminderCandidate, PartnerPaymentObligation } from "../../types";
import {
  FINANCE_REMINDER_OUTBOUND_MODE,
  FINANCE_REMINDER_SMS_ENABLED,
  projectFinanceReminders,
  reminderMilestone,
} from "../finance-reminder.service";

describe("FINANCE_REMINDER_V1", () => {
  it.each([
    ["2026-09-13", "D-7"], ["2026-09-09", "D-3"], ["2026-09-06", "D0"],
    ["2026-09-05", "D+1"], ["2026-09-03", "D+3"], ["2026-08-30", "D+7"],
    ["2026-08-23", "WEEKLY_D+14"], ["2026-08-24", null],
  ])("maps due date %s to %s", (dueDate, expected) => {
    expect(reminderMilestone("2026-09-06", dueDate)).toBe(expected);
  });

  it("aggregates obligations into one email and one in-app projection per company window", () => {
    const result = projectFinanceReminders([
      candidate({ id: "10000000-0000-4000-8000-000000000001", currency: "MDL", remainingAmount: "100.00" }),
      candidate({ id: "10000000-0000-4000-8000-000000000002", oneCOrderId: "20000000-0000-4000-8000-000000000002", currency: "USD", remainingAmount: "20.00" }),
    ], "2026-09-06");
    expect(result.projections.filter((row) => row.channel === "email")).toHaveLength(1);
    expect(result.projections.filter((row) => row.channel === "in_app")).toHaveLength(1);
    expect(result.projections.filter((row) => row.channel === "sms_future")).toHaveLength(1);
    expect(result.projections[0]).toMatchObject({ totalsByCurrency: { MDL: "100.00", USD: "20.00" } });
    expect(new Set(result.projections.map((row) => row.fingerprint)).size).toBe(3);
  });

  it.each([
    [{ paymentStatus: "SETTLED", remainingAmount: "0" }, "SETTLED"],
    [{ paymentStatus: "OPEN", remainingAmount: "0" }, "NO_OUTSTANDING_BALANCE"],
    [{ reconciliationStatus: "UNSUPPORTED" }, "UNSUPPORTED_OBLIGATION"],
    [{ reconciliationStatus: "NON_RECONCILING" }, "NON_RECONCILING"],
  ] as const)("suppresses ineligible obligation truth", (change, reason) => {
    const result = projectFinanceReminders([candidate(change as Partial<PartnerPaymentObligation>)], "2026-09-06");
    expect(result.projections).toEqual([]);
    expect(result.suppressions).toEqual([expect.objectContaining({ reason })]);
  });

  it("suppresses stale and out-of-window data", () => {
    expect(projectFinanceReminders([candidate({}, { financeDataFresh: false })], "2026-09-06").suppressions[0]?.reason).toBe("FINANCE_DATA_STALE");
    expect(projectFinanceReminders([candidate({ dueDate: "2026-09-08" })], "2026-09-06").suppressions[0]?.reason).toBe("NOT_IN_REMINDER_WINDOW");
  });

  it("keeps in-app eligibility but suppresses email when the governed recipient has no email", () => {
    const result = projectFinanceReminders([candidate({}, { recipientEmail: null })], "2026-09-06");
    expect(result.projections.map((row) => row.channel).sort()).toEqual(["in_app", "sms_future"]);
    expect(result.suppressions[0]?.reason).toBe("NO_VALID_EMAIL");
  });

  it("changes deterministic identity when the due-date reconciliation fingerprint changes", () => {
    const before = projectFinanceReminders([candidate()], "2026-09-06").projections.find((row) => row.channel === "email")!;
    const after = projectFinanceReminders([candidate({ reconciliationFingerprint: "changed" } as never)], "2026-09-06").projections.find((row) => row.channel === "email")!;
    expect(before.fingerprint).not.toBe(after.fingerprint);
    expect(projectFinanceReminders([candidate()], "2026-09-06").projections.find((row) => row.channel === "email")?.fingerprint).toBe(before.fingerprint);
  });

  it("renders RU and RO content without executing outbound delivery", () => {
    const ru = projectFinanceReminders([candidate()], "2026-09-06").projections[0];
    const ro = projectFinanceReminders([candidate({}, { locale: "ro" })], "2026-09-06").projections[0];
    expect(ru.subject).toContain("Novotech");
    expect(ro.subject).toContain("Calendarul");
    expect(FINANCE_REMINDER_OUTBOUND_MODE).toBe("DRY_RUN");
    expect(FINANCE_REMINDER_SMS_ENABLED).toBe(false);
  });
});

function candidate(
  obligationChange: Partial<PartnerPaymentObligation & { reconciliationFingerprint: string }> = {},
  candidateChange: Partial<FinanceReminderCandidate> = {},
): FinanceReminderCandidate {
  const obligation = {
    id: "10000000-0000-4000-8000-000000000001", companyId: "30000000-0000-4000-8000-000000000003",
    oneCOrderId: "20000000-0000-4000-8000-000000000001", orderNumber: "CO-1", orderDate: "2026-09-01",
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
    recipientUserId: "40000000-0000-4000-8000-000000000004", recipientEmail: "finance@example.test",
    recipientRole: "partner_accounting", locale: "ru", ...candidateChange,
  };
}
