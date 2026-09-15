import "server-only";

import type { User } from "@supabase/supabase-js";

import {
  CustomerIdentityResolutionService,
  SupabaseCustomerIdentityRepository,
} from "@/src/modules/customer-identity";
import { canonicalMoldovaE164 } from "@/src/modules/final-customer-auth/auth-phone";

import type { FinalCustomerRepository } from "./repository";
import {
  CUSTOMER_SERVICE_REQUEST_STATUSES, CUSTOMER_SERVICE_REQUEST_TYPES,
  type CustomerServiceRequestStatus, type FinalCustomerAccount,
} from "./types";
import { customerServiceCancelAllowed, customerServiceReplyAllowed } from "./service-lifecycle";

export class FinalCustomerAuthenticationError extends Error {
  constructor() {
    super("Final Customer authentication required.");
    this.name = "FinalCustomerAuthenticationError";
  }
}

export class FinalCustomerAccountService {
  constructor(
    private readonly repository: FinalCustomerRepository,
    private readonly identityResolver = new CustomerIdentityResolutionService(
      new SupabaseCustomerIdentityRepository(),
    ),
  ) {}

  async ensureAccount(user: User): Promise<FinalCustomerAccount> {
    const verifiedPhone = user.phone ? canonicalMoldovaE164(user.phone) : null;
    if (!user.id || !verifiedPhone || !user.phone_confirmed_at) {
      throw new FinalCustomerAuthenticationError();
    }
    const existing = await this.repository.findAccountByAuthUser(user.id);
    if (existing) return existing;

    const resolution = await this.identityResolver.resolve({
      customerType: "PERSON",
      phone: verifiedPhone,
      verifiedKeyTypes: ["PHONE"],
      createIfMissing: true,
      exposeCandidateIds: false,
    });
    return this.repository.createAccount({
      authUserId: user.id,
      customerIdentityId: resolution.customerIdentityId,
      resolutionStatus: resolution.status,
    });
  }

  async overview(account: FinalCustomerAccount) {
    const [resolvedName, orders] = await Promise.all([
      account.displayName ? Promise.resolve(account.displayName) : this.repository.findDisplayName(account.customerIdentityId),
      account.status === "ACTIVE" ? this.repository.listOrders(account.customerIdentityId, 5) : Promise.resolve([]),
    ]);
    return { displayName: resolvedName, orders, latestOrder: orders[0] ?? null };
  }

  listOrders(account: FinalCustomerAccount, limit = 20, offset = 0) {
    return account.status === "ACTIVE"
      ? this.repository.listOrders(account.customerIdentityId, limit, offset)
      : Promise.resolve([]);
  }

  commandCenter(account: FinalCustomerAccount) {
    return account.status === "ACTIVE" ? this.repository.getCommandCenter(account.customerIdentityId) : Promise.resolve({ displayName: account.displayName, latestOrder: null, recentPurchases: [], equipmentCount: 0, documentCount: 0, latestRequest: null, serviceNeedsInfoCount: 0, activeServiceRequestCount: 0 });
  }

  async orderDetail(account: FinalCustomerAccount, orderId: string) {
    if (account.status !== "ACTIVE" || !UUID.test(orderId)) return null;
    return this.repository.findOrder(account.customerIdentityId, orderId);
  }

  async purchases(account: FinalCustomerAccount, limit = 20, offset = 0) {
    if (account.status !== "ACTIVE") return [];
    const purchases = await this.repository.listConfirmedPurchases(account.customerIdentityId, limit, offset);
    const current = await this.repository.listCurrentProducts(unique(purchases.map((line) => line.publicProductId)));
    const byId = new Map(current.map((product) => [product.publicProductId, product]));
    return purchases.map((line) => ({ ...line, currentProduct: byId.get(line.publicProductId) ?? null }));
  }

  async equipment(account: FinalCustomerAccount, limit = 20, offset = 0) {
    return (await this.purchases(account, limit, offset)).filter((line) => line.unitCode !== "service");
  }

  async equipmentDetail(account: FinalCustomerAccount, lineId: string) {
    if (account.status !== "ACTIVE" || !UUID.test(lineId)) return null;
    const purchase = await this.repository.findPurchase(account.customerIdentityId, lineId);
    if (!purchase || purchase.unitCode === "service") return null;
    const current = (await this.repository.listCurrentProducts([purchase.publicProductId]))[0] ?? null;
    const documents = current ? await this.repository.listProductDocuments([current.sourceProductId]) : [];
    return { ...purchase, currentProduct: current, documents };
  }

  async documents(account: FinalCustomerAccount) {
    const purchases = await this.purchases(account, 50);
    const sourceIds = unique(purchases.flatMap((line) => line.currentProduct ? [line.currentProduct.sourceProductId] : []));
    const documents = await this.repository.listProductDocuments(sourceIds);
    const productBySource = new Map(purchases.flatMap((line) => line.currentProduct ? [[line.currentProduct.sourceProductId, line]] as const : []));
    return documents.map((document) => ({ ...document, purchase: productBySource.get(document.productId) ?? null }));
  }

  listServiceRequests(account: FinalCustomerAccount, limit = 20, offset = 0) {
    return account.status === "ACTIVE" ? this.repository.listServiceRequests(account.customerIdentityId, limit, offset) : Promise.resolve([]);
  }

  async serviceRequest(account: FinalCustomerAccount, requestId: string) {
    if (account.status !== "ACTIVE" || !UUID.test(requestId)) return null;
    return this.repository.findServiceRequest(account.customerIdentityId, requestId);
  }

  async createServiceRequest(account: FinalCustomerAccount, input: Record<string, string>) {
    if (account.status !== "ACTIVE" || !account.customerIdentityId) throw new Error("CUSTOMER_IDENTITY_REQUIRED");
    const type = input.type as (typeof CUSTOMER_SERVICE_REQUEST_TYPES)[number];
    if (!CUSTOMER_SERVICE_REQUEST_TYPES.includes(type)) throw new Error("INVALID_SERVICE_REQUEST");
    const subject = bounded(input.subject, 3, 160);
    const description = bounded(input.description, 10, 2000);
    const preferredContact = input.preferredContact === "EMAIL" ? "EMAIL" : "PHONE";
    if (preferredContact === "EMAIL" && !account.email) throw new Error("CUSTOMER_EMAIL_REQUIRED");
    const orderId = optionalUuid(input.orderId);
    const orderLineId = optionalUuid(input.orderLineId);
    if (orderLineId && !orderId) throw new Error("INVALID_SERVICE_REQUEST");
    if (orderId) {
      const order = await this.repository.findOrder(account.customerIdentityId, orderId);
      if (!order || (orderLineId && !order.lines.some((line) => line.id === orderLineId))) throw new Error("INVALID_SERVICE_REFERENCE");
    }
    return this.repository.createServiceRequest({ accountId: account.id, actorUserId: account.authUserId, customerIdentityId: account.customerIdentityId, type, subject, description, preferredContact, orderId, orderLineId });
  }

  async cancelServiceRequest(account: FinalCustomerAccount, requestId: string, expectedVersion: number) {
    if (!account.customerIdentityId || !UUID.test(requestId) || !Number.isInteger(expectedVersion) || expectedVersion < 0) throw new Error("INVALID_SERVICE_REQUEST");
    const request = await this.repository.findServiceRequest(account.customerIdentityId, requestId);
    if (!request || !customerServiceCancelAllowed(request.status)) throw new Error("INVALID_SERVICE_TRANSITION");
    return this.repository.cancelServiceRequest(account.customerIdentityId, requestId, expectedVersion, account.authUserId);
  }

  async replyToServiceRequest(account: FinalCustomerAccount, requestId: string, expectedVersion: number, bodyValue: string) {
    if (!account.customerIdentityId || !UUID.test(requestId) || !Number.isInteger(expectedVersion) || expectedVersion < 0) throw new Error("INVALID_SERVICE_REQUEST");
    const body = bounded(bodyValue, 1, 4000);
    const request = await this.repository.findServiceRequest(account.customerIdentityId, requestId);
    if (!request || !customerServiceReplyAllowed(request.status)) throw new Error("INVALID_SERVICE_TRANSITION");
    return this.repository.addCustomerServiceReply({ customerIdentityId: account.customerIdentityId, requestId, expectedVersion, actorUserId: account.authUserId, body });
  }

  listServiceNotifications(account: FinalCustomerAccount) {
    return account.status === "ACTIVE" ? this.repository.listServiceNotifications(account.id, 20) : Promise.resolve([]);
  }

  markServiceNotificationRead(account: FinalCustomerAccount, notificationId: string) {
    if (!UUID.test(notificationId)) throw new Error("INVALID_NOTIFICATION");
    return this.repository.markServiceNotificationRead(notificationId, account.authUserId);
  }

  listAdminServiceRequests(status: CustomerServiceRequestStatus | null) {
    if (status && !CUSTOMER_SERVICE_REQUEST_STATUSES.includes(status)) throw new Error("INVALID_SERVICE_STATUS");
    return this.repository.listAdminServiceRequests(100, status);
  }

  findAdminServiceRequest(requestId: string) {
    return UUID.test(requestId) ? this.repository.findAdminServiceRequest(requestId) : Promise.resolve(null);
  }

  async updateAdminServiceRequest(input: { requestId: string; expectedVersion: number; status: CustomerServiceRequestStatus | null; customerReply: string; internalNote: string; actorUserId: string }) {
    if (!UUID.test(input.requestId) || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 0 || (input.status && !CUSTOMER_SERVICE_REQUEST_STATUSES.includes(input.status))) throw new Error("INVALID_SERVICE_STATUS");
    const customerReply = optionalBounded(input.customerReply, 4000);
    const internalNote = optionalBounded(input.internalNote, 4000);
    if (input.status === "NEED_INFO" && !customerReply) throw new Error("NEED_INFO_EXPLANATION_REQUIRED");
    return this.repository.updateAdminServiceRequest({ ...input, customerReply, internalNote });
  }

  async updateProfile(account: FinalCustomerAccount, input: { displayName: string; email: string }) {
    const displayName = input.displayName.trim().replace(/\s+/g, " ") || null;
    const email = input.email.trim().toLowerCase() || null;
    if (displayName && (displayName.length < 2 || displayName.length > 160)) {
      throw new Error("INVALID_PROFILE");
    }
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw new Error("INVALID_PROFILE");
    }
    await this.repository.updateProfile(account.id, displayName, email);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function unique(values: string[]) { return [...new Set(values)]; }
function optionalUuid(value?: string) { const normalized = value?.trim() || null; if (normalized && !UUID.test(normalized)) throw new Error("INVALID_UUID"); return normalized; }
function bounded(value: string | undefined, min: number, max: number) { const normalized = value?.trim().replace(/\s+/g, " ") ?? ""; if (normalized.length < min || normalized.length > max) throw new Error("INVALID_TEXT"); return normalized; }
function optionalBounded(value: string | undefined, max: number) { const normalized = value?.trim() ?? ""; if (normalized.length > max) throw new Error("INVALID_TEXT"); return normalized; }
