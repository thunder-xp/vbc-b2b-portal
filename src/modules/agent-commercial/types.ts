export type AgentCommissionClassification = "EQUIPMENT" | "NOVOTECH_INSTALLATION" | "EXCLUDED";
export type AgentSaleProjectionState = "LINKED" | "REALIZED" | "PARTIALLY_PAID" | "FULLY_PAID" | "CANCELLED" | "RECONCILIATION_REQUIRED";
export type AgentRewardState = "FORECAST" | "ELIGIBLE" | "FINANCE_REVIEW" | "APPROVED" | "READY_FOR_PAYOUT" | "PAID" | "ADJUSTED" | "BLOCKED";

export type OneCAgentCandidate = {
  reference: string;
  code: string;
  fiscalCode: string | null;
  name: string;
};

export type OneCCommercialOrderLine = {
  lineRef: string;
  nomenclatureRef: string;
  name: string;
  gross: number;
  vat: number;
  net: number;
};

export type OneCCommercialOrderCandidate = {
  reference: string;
  number: string;
  date: string;
  customerRef: string;
  customerName: string;
  customerKind: "PERSON" | "LEGAL_ENTITY";
  organizationRef: string;
  grossAmount: number;
  currency: string;
  state: string | null;
  posted: boolean;
  deletionMarked: boolean;
  sourceVersion: string;
  lines: OneCCommercialOrderLine[];
};

export type AgentCommercialAdminDetail = {
  binding: null | {
    sourceAgent1cId: string;
    sourceExternalCode: string;
    sourceFiscalCode: string | null;
    sourceNameSnapshot: string;
    linkedAt: string;
  };
  attributions: Array<{
    id: string;
    referralId: string;
    customerIdentityId: string;
    customerName: string;
    referralCode: string;
    status: string;
  }>;
  sales: Array<{
    id: string;
    orderRef: string;
    orderNumber: string;
    orderDate: string;
    customerName: string;
    saleState: AgentSaleProjectionState | null;
    paymentState: string | null;
    rewardState: AgentRewardState | null;
    rewardAmount: number | null;
    currency: string;
    classificationComplete: boolean | null;
    realizationRefs: string[];
    realizationEvidence: Array<{
      type: "DELIVERY" | "WORK_ACT";
      ref: string;
      number: string;
      date: string;
      amount: number;
    }>;
    paymentEvidence: Array<{
      type: "BANK" | "CASH";
      ref: string;
      number: string;
      date: string;
      allocatedAmount: number;
    }>;
    realizedGrossAmount: number;
    vatAmount: number;
    netRealizedAmount: number;
    paidGrossAmount: number;
    fullyPaidAt: string | null;
    sourceObservedAt: string | null;
    lines: Array<{
      lineRef: string;
      nomenclatureRef: string;
      name: string;
      netAmount: number;
      classification: AgentCommissionClassification | null;
      classificationStatus: "CLASSIFIED" | "BLOCKED_FROM_CALCULATION";
    }>;
  }>;
};

export type AgentDealSummary = {
  id: string;
  client: string;
  orderNumber: string;
  orderDate: string;
  currency: string;
  state: AgentSaleProjectionState | null;
  orderState: string | null;
  realizedAmount: number | null;
  paymentState: string | null;
  rewardState: AgentRewardState | null;
  rewardAmount: number | null;
};

export type AgentDealDetail = AgentDealSummary & {
  vatAmount: number;
  netRealizedAmount: number;
  fullyPaidAt: string | null;
  equipmentNetAmount: number;
  installationNetAmount: number;
  excludedNetAmount: number;
  equipmentRatePercent: number;
  installationRatePercent: number;
  classificationComplete: boolean;
  paidAt: string | null;
  safeBlockedReason: "CLASSIFICATION_PENDING" | "PAYMENT_RECONCILIATION" | "REVIEW_REQUIRED" | null;
};

export type AgentRewardsView = {
  totals: { expected: number; review: number; available: number; paid: number };
  items: Array<{
    saleLinkId: string;
    orderNumber: string;
    orderDate: string;
    state: AgentRewardState;
    amount: number;
    currency: string;
    paidAt: string | null;
    safeBlockedReason: "CLASSIFICATION_PENDING" | "PAYMENT_RECONCILIATION" | "REVIEW_REQUIRED" | null;
  }>;
};

export type AgentRewardFinanceQueueItem = {
  saleLinkId: string;
  agentId: string;
  agentName: string;
  agentCode: string;
  customerName: string;
  orderNumber: string;
  orderDate: string;
  state: AgentRewardState;
  amount: number;
  currency: string;
  updatedAt: string;
};

export type AgentRewardFinanceDetail = AgentRewardFinanceQueueItem & {
  classificationComplete: boolean;
  equipmentNetAmount: number;
  installationNetAmount: number;
  excludedNetAmount: number;
  equipmentRatePercent: number;
  installationRatePercent: number;
  saleState: AgentSaleProjectionState;
  paymentState: string;
  realizedGrossAmount: number;
  paidGrossAmount: number;
  fullyPaidAt: string | null;
  realizationEvidence: AgentCommercialAdminDetail["sales"][number]["realizationEvidence"];
  paymentEvidence: AgentCommercialAdminDetail["sales"][number]["paymentEvidence"];
  paidAt: string | null;
  paidBy: string | null;
  payoutReference: string | null;
  payoutNote: string | null;
  events: Array<{
    id: string;
    fromState: string | null;
    toState: string;
    actorUserId: string | null;
    reason: string | null;
    amount: number | null;
    currency: string | null;
    payoutReference: string | null;
    createdAt: string;
  }>;
};

export type AgentRewardPayoutResult = {
  outcome: "APPLIED" | "ALREADY_APPLIED";
  saleLinkId: string;
  state: "PAID";
  amount: number;
  currency: string;
  paidAt: string;
};

export type AgentCommercialKpis = {
  clients: number;
  dealsInProgress: number;
  expectedReward: number;
  availablePayout: number;
  currency: string;
};
