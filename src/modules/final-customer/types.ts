export type CustomerIdentityResolutionStatus = "MATCHED" | "NEW" | "AMBIGUOUS" | "CONFLICT";

export type FinalCustomerAccount = Readonly<{
  id: string;
  authUserId: string;
  customerIdentityId: string | null;
  status: "ACTIVE" | "IDENTITY_REVIEW_REQUIRED" | "SUSPENDED";
  identityResolutionStatus: CustomerIdentityResolutionStatus;
  displayName: string | null;
  email: string | null;
  createdAt: string;
  lastLoginAt: string;
}>;

export type FinalCustomerOrderSummary = Readonly<{
  id: string;
  number: string;
  status: string;
  createdAt: string;
  total: number;
  currency: string;
  itemCount: number;
  paidAt: string | null;
}>;

export type FinalCustomerOrderLine = Readonly<{
  id: string;
  lineNumber: number;
  publicProductId: string;
  sku: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  lineTotal: number;
  currency: string;
}>;

export type FinalCustomerOrderDetail = FinalCustomerOrderSummary & Readonly<{
  lines: FinalCustomerOrderLine[];
  events: ReadonlyArray<{ id: string; type: string; createdAt: string }>;
  deliveryAddress: Readonly<Record<string, unknown>>;
}>;

export type FinalCustomerCurrentProduct = Readonly<{
  publicProductId: string;
  sourceProductId: string;
  slug: string;
  name: string;
  price: number;
  currency: string;
  availability: string;
  imageUrl: string | null;
}>;

export type FinalCustomerPurchase = FinalCustomerOrderLine & Readonly<{
  orderId: string;
  orderNumber: string;
  purchasedAt: string;
  currentProduct: FinalCustomerCurrentProduct | null;
}>;

export type FinalCustomerProductDocument = Readonly<{
  id: string;
  productId: string;
  title: string;
  type: string;
  url: string;
}>;

export const CUSTOMER_SERVICE_REQUEST_TYPES = [
  "INSTALLATION_REQUEST", "DIAGNOSTICS", "WARRANTY_QUESTION",
  "PRODUCT_QUESTION", "ORDER_QUESTION", "OTHER",
] as const;
export type CustomerServiceRequestType = typeof CUSTOMER_SERVICE_REQUEST_TYPES[number];
export const CUSTOMER_SERVICE_REQUEST_STATUSES = [
  "NEW", "IN_REVIEW", "NEED_INFO", "ACCEPTED", "RESOLVED", "CLOSED", "CANCELLED",
] as const;
export type CustomerServiceRequestStatus = typeof CUSTOMER_SERVICE_REQUEST_STATUSES[number];

export type CustomerServiceRequest = Readonly<{
  id: string;
  number: string;
  type: CustomerServiceRequestType;
  subject: string;
  description: string;
  preferredContact: "PHONE" | "EMAIL";
  status: CustomerServiceRequestStatus;
  orderId: string | null;
  orderLineId: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}>;

export type FinalCustomerCommandCenter = Readonly<{
  displayName: string | null;
  latestOrder: FinalCustomerOrderSummary | null;
  recentPurchases: ReadonlyArray<{ id: string; name: string; sku: string }>;
  equipmentCount: number;
  documentCount: number;
  latestRequest: { id: string; number: string; status: CustomerServiceRequestStatus } | null;
}>;

export type FinalCustomerContext = Readonly<{
  account: FinalCustomerAccount;
  verifiedPhone: string;
  displayName: string | null;
  aal: "aal1" | "aal2" | null;
}>;
