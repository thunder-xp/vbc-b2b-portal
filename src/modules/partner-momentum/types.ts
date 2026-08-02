export const MOMENTUM_CALCULATION_VERSION = "2026-08-02-v1";

export type MomentumStatus =
  | "growth"
  | "stable"
  | "slowing"
  | "attention_required"
  | "high_risk"
  | "insufficient_history"
  | "recovered";

export type MomentumEligibility = "eligible" | "insufficient_history" | "excluded";

export type MomentumReasonCode =
  | "order_volume_down"
  | "order_frequency_down"
  | "purchase_cycle_overdue"
  | "assortment_breadth_down"
  | "recurring_products_missing"
  | "no_orders_in_current_window"
  | "active_cart_not_converted"
  | "template_not_used"
  | "relevant_products_now_available"
  | "relevant_arrival_confirmed"
  | "price_opportunity_available"
  | "campaign_available"
  | "recovered_after_order";

export type MomentumOrderFact = {
  id: string;
  orderedAt: string;
  total: number;
  currency: string | null;
  units: number;
  productIds: string[];
};

export type MomentumIntent = {
  activeCart: boolean;
  templateCount: number;
  purchasingListCount: number;
  opportunityCount: number;
  campaignCount: number;
};

export type MomentumPreviousSnapshot = {
  status: MomentumStatus;
  calculatedAt: string;
  pendingStatus: MomentumStatus | null;
  pendingCount: number;
};

export type MomentumCalculationInput = {
  companyId: string;
  companyActive: boolean;
  sourceFingerprint: string;
  now: string;
  orders: MomentumOrderFact[];
  intent: MomentumIntent;
  previous: MomentumPreviousSnapshot | null;
};

export type MomentumReason = {
  code: MomentumReasonCode;
  value: number | null;
};

export type MomentumCalculation = {
  companyId: string;
  calculationVersion: string;
  calculatedAt: string;
  eligibility: MomentumEligibility;
  status: MomentumStatus;
  rawStatus: MomentumStatus;
  score: number | null;
  pendingStatus: MomentumStatus | null;
  pendingCount: number;
  primaryCurrency: string | null;
  multiCurrency: boolean;
  lastOrderAt: string | null;
  normalOrderIntervalDays: number | null;
  averageOrderIntervalDays: number | null;
  cycleOverrunRatio: number | null;
  orderCountCurrent: number;
  orderCountBaseline: number;
  unitsCurrent: number;
  unitsBaseline: number;
  skuCountCurrent: number;
  skuCountBaseline: number;
  monetaryCurrent: Record<string, number>;
  monetaryBaseline: Record<string, number>;
  reasons: MomentumReason[];
  sourceFingerprint: string;
  recoveredOrderId: string | null;
};

export type PartnerMomentumSummary = {
  status: "slowing" | "attention_required" | "high_risk";
  title: string;
  explanation: string;
  actions: Array<{ key: string; label: string; href: string }>;
  calculatedAt: string;
  sourceFingerprint: string;
};

export type MomentumSource = MomentumCalculationInput & {
  assignedManagerId: string | null;
  orderRowsScanned: number;
  sourceTruncated: boolean;
};

export type AdminMomentumPage = {
  items: AdminMomentumRow[];
  totalCount: number;
};

export type AdminMomentumRow = {
  companyId: string;
  companyName: string;
  fiscalCode: string | null;
  managerId: string | null;
  managerName: string | null;
  status: MomentumStatus;
  score: number | null;
  lastOrderAt: string | null;
  normalOrderIntervalDays: number | null;
  cycleOverrunRatio: number | null;
  orderCountCurrent: number;
  orderCountBaseline: number;
  skuCountCurrent: number;
  skuCountBaseline: number;
  reasonCodes: MomentumReasonCode[];
  calculatedAt: string;
};
