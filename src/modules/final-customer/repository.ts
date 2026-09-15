import type {
  CustomerServiceRequest, CustomerServiceRequestStatus, CustomerServiceRequestType,
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
  getCommandCenter(customerIdentityId: string | null): Promise<import("./types").FinalCustomerCommandCenter>;
  listOrders(customerIdentityId: string | null, limit: number, offset?: number): Promise<FinalCustomerOrderSummary[]>;
  findOrder(customerIdentityId: string | null, orderId: string): Promise<FinalCustomerOrderDetail | null>;
  listConfirmedPurchases(customerIdentityId: string | null, limit: number, offset?: number): Promise<FinalCustomerPurchase[]>;
  findPurchase(customerIdentityId: string | null, lineId: string): Promise<FinalCustomerPurchase | null>;
  listCurrentProducts(publicProductIds: string[]): Promise<FinalCustomerCurrentProduct[]>;
  listProductDocuments(sourceProductIds: string[]): Promise<FinalCustomerProductDocument[]>;
  listServiceRequests(customerIdentityId: string | null, limit: number, offset?: number): Promise<CustomerServiceRequest[]>;
  findServiceRequest(customerIdentityId: string | null, requestId: string): Promise<CustomerServiceRequest | null>;
  createServiceRequest(input: Readonly<{ accountId: string; actorUserId: string; customerIdentityId: string; type: CustomerServiceRequestType; subject: string; description: string; preferredContact: "PHONE" | "EMAIL"; orderId: string | null; orderLineId: string | null }>): Promise<CustomerServiceRequest>;
  cancelServiceRequest(customerIdentityId: string, requestId: string, expectedVersion: number, actorUserId: string): Promise<void>;
  listAdminServiceRequests(limit: number, status: CustomerServiceRequestStatus | null): Promise<CustomerServiceRequest[]>;
  findAdminServiceRequest(requestId: string): Promise<CustomerServiceRequest | null>;
  updateAdminServiceRequestStatus(requestId: string, expectedVersion: number, status: CustomerServiceRequestStatus, actorUserId: string): Promise<void>;
  updateProfile(accountId: string, displayName: string | null, email: string | null): Promise<void>;
}
