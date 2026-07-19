export type OrderDateChangeRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export type OrderDateChangeRequest = {
  id: string;
  companyId: string;
  orderHistoryId: string;
  requestedBy: string;
  currentDateSnapshot: string;
  requestedDate: string;
  comment: string | null;
  status: OrderDateChangeRequestStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  synchronizedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
