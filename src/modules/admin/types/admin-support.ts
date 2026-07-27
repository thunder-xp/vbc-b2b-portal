export interface AdminSupportRecord {
  id: string;
  company: string;
  reference: string;
  title: string;
  status: string;
  updatedAt: string;
  primaryCount: number;
  secondaryCount: number;
  safeState: string | null;
}

export interface AdminSupportPage {
  records: readonly AdminSupportRecord[];
  total: number;
  page: number;
  pageSize: number;
}
