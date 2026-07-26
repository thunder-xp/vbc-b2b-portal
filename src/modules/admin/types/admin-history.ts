export type AdminHistoryEvent = {
  eventKey: string;
  sourceType: string;
  companyId: string | null;
  companyName: string | null;
  targetUserId: string | null;
  targetName: string | null;
  targetEmail: string | null;
  actorName: string | null;
  eventType: string;
  reason: string | null;
  safeDetail: string | null;
  createdAt: string;
};

export type AdminHistoryPage = {
  records: AdminHistoryEvent[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};
