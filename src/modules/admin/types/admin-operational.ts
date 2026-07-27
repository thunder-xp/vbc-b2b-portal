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
}

export interface AdminOperationalPage {
  records: readonly AdminOperationalRecord[];
  total: number;
  page: number;
  pageSize: number;
}
