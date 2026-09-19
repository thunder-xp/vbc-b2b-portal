import type {
  CustomerServiceNotification, CustomerServiceRequest, CustomerServiceRequestDetail, CustomerServiceRequestStatus, CustomerServiceRequestType,
  FinalCustomerAccount, FinalCustomerCurrentProduct, FinalCustomerOrderDetail,
  FinalCustomerOrderSummary, FinalCustomerProductDocument, FinalCustomerPurchase,
} from "./types";

export interface FinalCustomerRepository {
  findAccountByAuthUser(authUserId: string): Promise<FinalCustomerAccount | null>;
  createAccount(input: Readonly<{
    authUserId: string;
    customerIdentityId: string | null;
    resolutionStatus: "MATCHED" | "NEW" | "AMBIGUOUS" | "CONFLICT";
  }>): Promise<FinalCustomerAccount>;
  findDisplayName(customerIdentityId: string | null): Promise<string | null>;
  getCommandCenter(accountId: string, customerIdentityId: string | null): Promise<import("./types").FinalCustomerCommandCenter>;
  openAttention(accountId: string, actorUserId: string, sourceKind: string, sourceId: string): Promise<string>;
  listOrders(customerIdentityId: string | null, limit: number, offset?: number): Promise<FinalCustomerOrderSummary[]>;
  findOrder(customerIdentityId: string | null, orderId: string): Promise<FinalCustomerOrderDetail | null>;
  listConfirmedPurchases(customerIdentityId: string | null, limit: number, offset?: number): Promise<FinalCustomerPurchase[]>;
  findPurchase(customerIdentityId: string | null, lineId: string): Promise<FinalCustomerPurchase | null>;
  listCurrentProducts(publicProductIds: string[]): Promise<FinalCustomerCurrentProduct[]>;
  listProductDocuments(sourceProductIds: string[]): Promise<FinalCustomerProductDocument[]>;
  listServiceRequests(customerIdentityId: string | null, limit: number, offset?: number): Promise<CustomerServiceRequest[]>;
  findServiceRequest(customerIdentityId: string | null, requestId: string): Promise<CustomerServiceRequestDetail | null>;
  createServiceRequest(input: Readonly<{ accountId: string; actorUserId: string; customerIdentityId: string; type: CustomerServiceRequestType; subject: string; description: string; preferredContact: "PHONE" | "EMAIL"; locale: "ru" | "ro"; orderId: string | null; orderLineId: string | null }>): Promise<CustomerServiceRequest>;
  cancelServiceRequest(customerIdentityId: string, requestId: string, expectedVersion: number, actorUserId: string): Promise<void>;
  listAdminServiceRequests(limit: number, status: CustomerServiceRequestStatus | null): Promise<CustomerServiceRequest[]>;
  findAdminServiceRequest(requestId: string): Promise<CustomerServiceRequestDetail | null>;
  addCustomerServiceReply(input: Readonly<{ customerIdentityId: string; requestId: string; expectedVersion: number; actorUserId: string; body: string }>): Promise<string>;
  updateAdminServiceRequest(input: Readonly<{ requestId: string; expectedVersion: number; status: CustomerServiceRequestStatus | null; customerReply: string; internalNote: string; actorUserId: string }>): Promise<{ messageId: string | null; eventId: string | null; eventCode: import("./notification-policy").CustomerServiceSmsEvent | null }>;
  addServiceAttachment(input: Readonly<{ requestId: string; messageId: string | null; actorKind: "CUSTOMER" | "ADMIN"; actorUserId: string; customerIdentityId: string | null; visibility: "CUSTOMER_VISIBLE" | "INTERNAL"; storagePath: string; fileName: string; contentType: string; sizeBytes: number; checksumSha256: string }>): Promise<string>;
  listServiceNotifications(accountId: string, limit: number): Promise<CustomerServiceNotification[]>;
  markServiceNotificationRead(notificationId: string, actorUserId: string): Promise<void>;
  updateProfile(accountId: string, displayName: string | null, email: string | null): Promise<void>;
}
