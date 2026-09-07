export type ContractBalanceType = "receivable" | "advance";

export type PartnerContractBalance = {
  id: string;
  companyId: string;
  externalContractRef: string;
  contractNumber: string;
  contractName: string;
  currencyRef: string;
  currencyCode: string;
  signedBalance: string;
  sourceVersion: string | null;
  synchronizedAt: string;
};

export type ContractBalanceView = PartnerContractBalance & {
  balanceType: ContractBalanceType;
  absoluteDisplayAmount: string;
};

export type ContractBalanceCurrencySummary = {
  currencyCode: string;
  receivableTotal: string;
  advanceTotal: string;
};

export type FinanceOverview = {
  summaries: ContractBalanceCurrencySummary[];
  contracts: ContractBalanceView[];
  synchronizedAt: string | null;
  state: FinanceDataState;
  showLastConfirmedNotice: boolean;
  paymentCalendar: PaymentCalendarView;
};

export type PaymentStatus = "OPEN" | "PARTIAL" | "SETTLED";
export type PaymentReconciliationStatus = "READY" | "UNSUPPORTED" | "NON_RECONCILING";
export type PaymentObligationUnsupportedReason =
  | "MULTI_LINE_SCHEDULE_UNSUPPORTED"
  | "CURRENCY_MISMATCH"
  | "CURRENCY_UNRESOLVED"
  | "COMPANY_UNRESOLVED"
  | "CONTRACT_UNRESOLVED"
  | "ORDER_UNPOSTED"
  | "ORDER_DELETED"
  | "PAYMENT_CALENDAR_EMPTY"
  | "SETTLEMENT_UNRESOLVED"
  | "AMOUNT_NON_RECONCILING";

export type PartnerPaymentObligation = {
  id: string;
  companyId: string;
  oneCOrderId: string;
  orderNumber: string;
  orderDate: string;
  oneCCounterpartyId: string | null;
  oneCContractId: string | null;
  oneCOrganizationId: string | null;
  scheduleLineNumber: number;
  sourceOrderDataVersion: string | null;
  paymentPercent: string;
  plannedAmount: string;
  vatAmount: string;
  currency: string;
  dueDate: string;
  paymentMethod: string;
  bankAccountId: string | null;
  bankAccountName: string | null;
  paidAmount: string;
  remainingAmount: string;
  paymentStatus: PaymentStatus;
  settlementLastPaymentAt: string | null;
  orderPosted: boolean;
  orderDeletionMark: boolean;
  orderStatus: string | null;
  reconciliationStatus: PaymentReconciliationStatus;
  unsupportedReason: PaymentObligationUnsupportedReason | null;
  sourceModifiedAt: string | null;
  sourceObservedAt: string;
  syncedAt: string;
};

export type PaymentCalendarItem = PartnerPaymentObligation & {
  daysFromDue: number;
  timing: "overdue" | "today" | "upcoming" | "later" | "settled";
};

export type PaymentCurrencySummary = {
  currency: string;
  outstanding: string;
  overdue: string;
  nextPaymentAmount: string | null;
  nextPaymentDueDate: string | null;
};

export type PaymentCalendarView = {
  summaries: PaymentCurrencySummary[];
  current: PaymentCalendarItem[];
  settled: PaymentCalendarItem[];
  freshness: "FINANCE_DATA_FRESH" | "FINANCE_DATA_STALE";
  synchronizedAt: string | null;
  unavailableCount: number;
};

export type PublishPaymentObligation = Omit<PartnerPaymentObligation, "id" | "companyId">;

export type PaymentObligationExclusion = {
  oneCOrderId: string;
  orderNumber: string;
  sourceOrderDataVersion: string | null;
  scheduleLineCount: number;
  reason: PaymentObligationUnsupportedReason;
  sourceObservedAt: string;
};

export type FinanceReminderCandidate = {
  obligation: PartnerPaymentObligation & { reconciliationFingerprint: string };
  companyName: string;
  financeDataFresh: boolean;
  recipientUserId: string | null;
  recipientEmail: string | null;
  recipientRole: "partner_accounting" | "partner_owner" | null;
  locale: "ru" | "ro";
};

export type FinanceReminderChannel = "email" | "in_app" | "sms_future";
export type FinanceReminderTiming = "UPCOMING" | "DUE_TODAY" | "OVERDUE";
export type FinanceReminderSuppressionReason =
  | "SETTLED"
  | "NO_OUTSTANDING_BALANCE"
  | "FINANCE_DATA_STALE"
  | "UNSUPPORTED_OBLIGATION"
  | "NON_RECONCILING"
  | "NO_VALID_EMAIL"
  | "DUPLICATE"
  | "NOT_IN_REMINDER_WINDOW";

export type FinanceReminderProjection = {
  companyId: string;
  channel: FinanceReminderChannel;
  recipientUserId: string | null;
  recipientEmail: string | null;
  locale: "ru" | "ro";
  milestone: string;
  timingStates: FinanceReminderTiming[];
  obligationIds: string[];
  totalsByCurrency: Record<string, string>;
  subject: string;
  body: string;
  fromName: string | null;
  fromEmail: string | null;
  ctaLabel: string;
  ctaTarget: "/cabinet/finance";
  contentPayload: Record<string, unknown>;
  deliveryIdentity: string;
  fingerprint: string;
};

export type FinanceReminderSuppression = {
  companyId: string;
  obligationId: string | null;
  reason: FinanceReminderSuppressionReason;
};

export type FinanceReminderDryRun = {
  id: string;
  businessDate: string;
  policyVersion: "FINANCE_REMINDER_V1";
  outboundMode: "DRY_RUN";
  eligibleCompanyCount: number;
  obligationCount: number;
  projectedEmailCount: number;
  projectedInAppCount: number;
  futureSmsEligibleCount: number;
  suppressedCount: number;
  duplicateCount: number;
  durationMs: number;
};

export type FinanceReminderCurrentLiveEligibleReview = {
  businessDate: string;
  policyVersion: "FINANCE_REMINDER_V1";
  outboundMode: "DRY_RUN";
  smsEnabled: false;
  eligibleCompanyCount: number;
  obligationCount: number;
  totalsByCurrency: Record<string, string>;
  ageing: {
    upcomingOrDueToday: number;
    overdue1To7: number;
    overdue8To30: number;
    overdue30Plus: number;
  };
  projections: FinanceReminderProjection[];
  suppressions: FinanceReminderSuppression[];
};

export type AdminFinanceOperations = {
  fresh: number;
  stale: number;
  missingEmail: number;
  supported: number;
  open: number;
  partial: number;
  settled: number;
  overdue: number;
  dueToday: number;
  dueNext7: number;
  dueNext30: number;
  nonReconciling: number;
  unsupported: number;
  companiesOverdue: number;
  overdueByCurrency: Record<string, string | number>;
  unsupportedByReason: Record<string, number>;
  ageing: Record<string, number>;
  latestDryRun: Record<string, unknown> | null;
};

export type FinanceSyncStatus = "running" | "succeeded" | "failed" | "mapping_missing";

export type FinanceSyncState = {
  companyId: string;
  status: FinanceSyncStatus;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
  receivedCount: number;
  publishedCount: number;
  excludedDeletedCount: number;
  sourceVersion: string | null;
  lastDurationMs: number | null;
};

export type FinanceDataState =
  | "never_synchronized"
  | "synchronized_nonzero"
  | "synchronized_zero"
  | "mapping_missing"
  | "failed_with_snapshot"
  | "failed_without_snapshot"
  | "stale";

export type FinanceSyncCompany = {
  companyId: string;
  companyName: string;
  counterpartyRef: string;
  activeBalanceCount: number;
};
