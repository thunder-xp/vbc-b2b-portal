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
  itemSummary: readonly string[];
  previewImageUrl?: string | null;
  paidAt: string | null;
  paymentState: EffectivePaymentState;
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
  lines: Array<FinalCustomerOrderLine & { currentProduct: FinalCustomerCurrentProduct | null }>;
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
  documentCount?: number;
}>;

export const CUSTOMER_OBJECT_TYPES = ["HOME", "APARTMENT", "OFFICE", "SHOP", "WAREHOUSE", "OTHER"] as const;
export type CustomerObjectType = typeof CUSTOMER_OBJECT_TYPES[number];

export type CustomerObjectSummary = Readonly<{
  id: string;
  name: string;
  objectType: CustomerObjectType;
  locality: string | null;
  addressLabel: string | null;
  status: "ACTIVE" | "ARCHIVED";
  version: number;
  purchaseCount: number;
  productCount: number;
  openServiceCount: number;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}>;

export type CustomerObjectWorkspace = Readonly<{
  objects: CustomerObjectSummary[];
  unlinkedPurchases: ReadonlyArray<{
    orderId: string;
    orderNumber: string;
    purchasedAt: string;
    productCount: number;
  }>;
  purchaseLinks: ReadonlyArray<{ orderId: string; objectId: string }>;
}>;

export type CustomerObjectDetail = Readonly<{
  object: Omit<CustomerObjectSummary, "purchaseCount" | "productCount" | "openServiceCount" | "lastActivityAt">;
  purchases: ReadonlyArray<{
    id: string;
    number: string;
    purchasedAt: string;
    total: number;
    currency: string;
    status: string;
    lines: ReadonlyArray<FinalCustomerOrderLine & {
      currentProduct: FinalCustomerCurrentProduct | null;
      documents: ReadonlyArray<FinalCustomerProductDocument>;
    }>;
  }>;
  serviceRequests: ReadonlyArray<{
    id: string;
    number: string;
    subject: string;
    status: CustomerServiceRequestStatus;
    createdAt: string;
  }>;
}>;

export type FinalCustomerProductDocument = Readonly<{
  id: string;
  productId: string;
  title: string;
  type: string;
  url: string;
}>;

export type FinalCustomerDocumentGroup = Readonly<{
  orderId: string;
  orderNumber: string;
  purchasedAt: string;
  products: ReadonlyArray<{
    lineId: string;
    sku: string;
    name: string;
    documents: ReadonlyArray<FinalCustomerProductDocument>;
  }>;
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
  customerObjectId: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  latestMessage?: string | null;
  latestMessageAuthor?: "CUSTOMER" | "NOVOTECH" | null;
  latestMessageAt?: string | null;
}>;

export type CustomerServiceMessage = Readonly<{
  id: string;
  authorType: "CUSTOMER" | "NOVOTECH";
  visibility: "CUSTOMER_VISIBLE" | "INTERNAL";
  body: string;
  createdAt: string;
}>;

export type CustomerServiceAttachment = Readonly<{
  id: string;
  messageId: string | null;
  uploadedByKind: "CUSTOMER" | "ADMIN";
  visibility: "CUSTOMER_VISIBLE" | "INTERNAL";
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}>;

export type CustomerServiceTimelineEvent = Readonly<{
  id: string;
  actorKind: "CUSTOMER" | "ADMIN" | "SYSTEM";
  eventType: string;
  fromStatus: CustomerServiceRequestStatus | null;
  toStatus: CustomerServiceRequestStatus | null;
  createdAt: string;
}>;

export type CustomerServiceRequestDetail = CustomerServiceRequest & Readonly<{
  messages: CustomerServiceMessage[];
  attachments: CustomerServiceAttachment[];
  timeline: CustomerServiceTimelineEvent[];
  customerDisplayName?: string | null;
  customerEmail?: string | null;
  relatedOrderNumber?: string | null;
  relatedProductName?: string | null;
  relatedObjectName?: string | null;
}>;

export type CustomerServiceNotification = Readonly<{
  id: string;
  requestId: string;
  eventCode: "CUSTOMER_SERVICE_NEED_INFO" | "CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH" | "CUSTOMER_SERVICE_RESOLVED";
  actionPath: string;
  readAt: string | null;
  createdAt: string;
}>;

export type CustomerAttentionItem = Readonly<{
  priority: "ACTION_REQUIRED" | "IMPORTANT_UPDATE" | "INFORMATIONAL";
  sourceKind: "SERVICE_REQUEST" | "SERVICE_NOTIFICATION" | "PAYMENT_PAID" | "PAYMENT_FAILED" | "PAYMENT_REFUNDED";
  sourceId: string;
  eventCode: "CUSTOMER_SERVICE_NEED_INFO" | "CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH" | "CUSTOMER_SERVICE_RESOLVED" | "CUSTOMER_PAYMENT_PAID" | "CUSTOMER_PAYMENT_FAILED" | "CUSTOMER_PAYMENT_REFUNDED";
  contextLabel: string;
  createdAt: string;
  actionPath: string;
}>;

export type FinalCustomerCommandCenter = Readonly<{
  displayName: string | null;
  latestOrder: FinalCustomerOrderSummary | null;
  recentPurchases: ReadonlyArray<{ id: string; name: string; sku: string }>;
  equipmentCount: number;
  documentCount: number;
  latestRequest: { id: string; number: string; status: CustomerServiceRequestStatus } | null;
  serviceNeedsInfoCount: number;
  activeServiceRequestCount: number;
  attentionItems: CustomerAttentionItem[];
}>;

export type FinalCustomerContext = Readonly<{
  account: FinalCustomerAccount;
  verifiedPhone: string;
  displayName: string | null;
  aal: "aal1" | "aal2" | null;
}>;
import type { EffectivePaymentState } from "@/src/modules/payments/types";
