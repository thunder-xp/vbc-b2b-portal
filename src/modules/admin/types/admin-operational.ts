export interface AdminOperationalRecord {
  id: string;
  company: string;
  reference: string;
  date: string | null;
  plannedDate: string | null;
  status: string;
  posted: boolean;
  positions: number;
  units: number;
  syncAt: string | null;
  warning: string | null;
  exportDiagnostic: {
    paymentMethod: "cashless" | "cash";
    plannedPaymentDate: string;
    fulfillmentMethod: "pickup" | "delivery";
    carrier: string | null;
    contract: string | null;
    priceType: string | null;
    readBackVerified: boolean;
    readBackResult: Readonly<Record<string, unknown>> | null;
    verifiedAt: string | null;
  } | null;
}

export interface AdminOperationalPage {
  records: readonly AdminOperationalRecord[];
  total: number;
  page: number;
  pageSize: number;
}
