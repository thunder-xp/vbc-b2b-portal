export interface AdminCommercialRecord {
  id: string;
  primary: string;
  secondary: string;
  status: string;
}

export interface AdminCommercialSummary {
  domain: string;
  metrics: Readonly<Record<string, string | number | null>>;
  records: readonly AdminCommercialRecord[];
}
