import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type { FinalCustomerRepository } from "./repository";
import type {
  CustomerServiceAttachment, CustomerServiceMessage, CustomerServiceNotification, CustomerServiceRequest, CustomerServiceRequestDetail, CustomerServiceRequestStatus, CustomerServiceTimelineEvent, FinalCustomerAccount,
  FinalCustomerCurrentProduct, FinalCustomerOrderDetail, FinalCustomerOrderLine,
  FinalCustomerOrderSummary, FinalCustomerProductDocument, FinalCustomerPurchase,
} from "./types";

const ACCOUNT_COLUMNS = "id,auth_user_id,customer_identity_id,status,identity_resolution_status,display_name,email,created_at,last_login_at";

export class SupabaseFinalCustomerRepository implements FinalCustomerRepository {
  async findAccountByAuthUser(authUserId: string) {
    const { data, error } = await createAdminClient()
      .from("customer_accounts")
      .select(ACCOUNT_COLUMNS)
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (error) throw repositoryError("read account", error.code);
    return data ? mapAccount(data) : null;
  }

  async createAccount(input: Parameters<FinalCustomerRepository["createAccount"]>[0]) {
    const admin = createAdminClient();
    const reviewRequired = input.resolutionStatus === "AMBIGUOUS" || input.resolutionStatus === "CONFLICT";
    const { data, error } = await admin
      .from("customer_accounts")
      .insert({
        auth_user_id: input.authUserId,
        customer_identity_id: input.customerIdentityId,
        status: reviewRequired ? "IDENTITY_REVIEW_REQUIRED" : "ACTIVE",
        identity_resolution_status: input.resolutionStatus,
      })
      .select(ACCOUNT_COLUMNS)
      .single();
    if (error) {
      if (error.code === "23505") {
        const existing = await this.findAccountByAuthUser(input.authUserId);
        if (existing) return existing;
      }
      throw repositoryError("create account", error.code);
    }

    const events = [{
      customer_account_id: data.id,
      event_type: "CUSTOMER_ACCOUNT_CREATED",
      safe_metadata: { resolutionStatus: input.resolutionStatus },
    }];
    events.push({
      customer_account_id: data.id,
      event_type: reviewRequired ? "IDENTITY_REVIEW_REQUIRED" : "CUSTOMER_IDENTITY_LINKED",
      safe_metadata: { resolutionStatus: input.resolutionStatus },
    });
    const { error: eventError } = await admin.from("customer_account_events").insert(events);
    if (eventError) throw repositoryError("record account event", eventError.code);

    if (data.customer_identity_id) {
      const { error: identityEventError } = await admin.from("customer_identity_events").insert({
        customer_identity_id: data.customer_identity_id,
        event_type: "CONTEXT_LINKED",
        source_context: "FINAL_CUSTOMER_ACCOUNT",
        source_record_id: data.id,
        safe_metadata: { resolutionStatus: input.resolutionStatus },
      });
      if (identityEventError) throw repositoryError("record identity link", identityEventError.code);
    }
    return mapAccount(data);
  }

  async findDisplayName(customerIdentityId: string | null) {
    if (!customerIdentityId) return null;
    const { data, error } = await createAdminClient()
      .from("retail_customers")
      .select("name")
      .eq("customer_identity_id", customerIdentityId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw repositoryError("read display name", error.code);
    return data?.name?.trim() || null;
  }

  async listOrders(customerIdentityId: string | null, limit: number, offset = 0) {
    return this.listOrdersPage(customerIdentityId, limit, offset);
  }

  async getCommandCenter(customerIdentityId: string | null) {
    if (!customerIdentityId) return { displayName: null, latestOrder: null, recentPurchases: [], equipmentCount: 0, documentCount: 0, latestRequest: null, serviceNeedsInfoCount: 0, activeServiceRequestCount: 0 };
    const { data, error } = await createAdminClient().rpc("get_final_customer_cabinet_overview_v1", { p_customer_identity_id: customerIdentityId });
    if (error) throw repositoryError("read command center", error.code);
    const value = (data ?? {}) as Record<string, unknown>;
    const latestOrder = value.latestOrder as Record<string, unknown> | null;
    const latestRequest = value.latestRequest as Record<string, unknown> | null;
    return {
      displayName: typeof value.displayName === "string" ? value.displayName : null,
      latestOrder: latestOrder ? { id: String(latestOrder.id), number: String(latestOrder.number), status: String(latestOrder.status), createdAt: String(latestOrder.createdAt), total: Number(latestOrder.total), currency: String(latestOrder.currency), itemCount: Number(latestOrder.itemCount), itemSummary: [], paidAt: latestOrder.paidAt ? String(latestOrder.paidAt) : null, paymentState: latestOrder.paidAt ? "PAID" as const : "UNPAID" as const } : null,
      recentPurchases: Array.isArray(value.recentPurchases) ? value.recentPurchases.flatMap((item) => item && typeof item === "object" ? [{ id: String((item as Row).id), name: String((item as Row).name), sku: String((item as Row).sku) }] : []) : [],
      equipmentCount: Number(value.equipmentCount ?? 0), documentCount: Number(value.documentCount ?? 0),
      latestRequest: latestRequest ? { id: String(latestRequest.id), number: String(latestRequest.number), status: latestRequest.status as CustomerServiceRequestStatus } : null,
      serviceNeedsInfoCount: Number(value.serviceNeedsInfoCount ?? 0), activeServiceRequestCount: Number(value.activeServiceRequestCount ?? 0),
    };
  }

  private async customerIds(customerIdentityId: string | null) {
    if (!customerIdentityId) return [];
    const admin = createAdminClient();
    const { data: customers, error: customerError } = await admin
      .from("retail_customers")
      .select("id")
      .eq("customer_identity_id", customerIdentityId)
      .limit(100);
    if (customerError) throw repositoryError("resolve retail contexts", customerError.code);
    return (customers ?? []).map((row) => row.id);
  }

  private async listOrdersPage(customerIdentityId: string | null, limit: number, offset: number) {
    const admin = createAdminClient();
    const customerIds = await this.customerIds(customerIdentityId);
    if (customerIds.length === 0) return [];

    const { data, error } = await admin
      .from("retail_orders")
      .select("id,public_number,status,created_at,priced_scope_total,currency,paid_at")
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false })
      .range(Math.max(offset, 0), Math.max(offset, 0) + Math.min(Math.max(limit, 1), 50) - 1);
    if (error) throw repositoryError("read retail orders", error.code);
    const orderIds = (data ?? []).map((row) => row.id);
    const counts = new Map<string, number>();
    const summaries = new Map<string, string[]>();
    const previews = new Map<string, string>();
    if (orderIds.length) {
      const { data: lines, error: lineError } = await admin.from("retail_order_lines").select("order_id,quantity,product_name,line_number,image_url_snapshot").in("order_id", orderIds).order("line_number");
      if (lineError) throw repositoryError("count retail order lines", lineError.code);
      for (const line of lines ?? []) {
        counts.set(line.order_id, (counts.get(line.order_id) ?? 0) + Number(line.quantity));
        const names = summaries.get(line.order_id) ?? [];
        if (names.length < 2 && line.product_name && !names.includes(line.product_name)) names.push(line.product_name);
        summaries.set(line.order_id, names);
        if (!previews.has(line.order_id) && line.image_url_snapshot) previews.set(line.order_id, line.image_url_snapshot);
      }
    }
    return (data ?? []).map((row): FinalCustomerOrderSummary => mapOrder(row, counts.get(row.id) ?? 0, summaries.get(row.id) ?? [], previews.get(row.id) ?? null));
  }

  async findOrder(customerIdentityId: string | null, orderId: string) {
    const admin = createAdminClient();
    const customerIds = await this.customerIds(customerIdentityId);
    if (!customerIds.length) return null;
    const { data: order, error } = await admin.from("retail_orders")
      .select("id,public_number,status,created_at,priced_scope_total,currency,paid_at,delivery_address_snapshot")
      .eq("id", orderId).in("customer_id", customerIds).maybeSingle();
    if (error) throw repositoryError("read retail order", error.code);
    if (!order) return null;
    const [{ data: lines, error: lineError }, { data: events, error: eventError }] = await Promise.all([
      admin.from("retail_order_lines").select("id,line_number,public_product_id,sku,product_name,slug_snapshot,image_url_snapshot,quantity,unit_code,unit_price,line_total,currency").eq("order_id", order.id).order("line_number"),
      admin.from("retail_order_events").select("id,event_type,created_at").eq("order_id", order.id).order("created_at"),
    ]);
    if (lineError || eventError) throw repositoryError("read retail order detail", lineError?.code ?? eventError?.code);
    const mappedLines = (lines ?? []).map(mapOrderLine);
    return {
      ...mapOrder(order, mappedLines.reduce((sum, line) => sum + line.quantity, 0), mappedLines.slice(0, 2).map((line) => line.name), mappedLines.find((line) => line.imageUrl)?.imageUrl ?? null),
      lines: mappedLines.map((line) => ({ ...line, currentProduct: null })),
      events: (events ?? []).map((row) => ({ id: row.id, type: row.event_type, createdAt: row.created_at })),
      deliveryAddress: (order.delivery_address_snapshot ?? {}) as Record<string, unknown>,
    } satisfies FinalCustomerOrderDetail;
  }

  async listConfirmedPurchases(customerIdentityId: string | null, limit: number, offset = 0) {
    const admin = createAdminClient();
    const customerIds = await this.customerIds(customerIdentityId);
    if (!customerIds.length) return [];
    const { data: orders, error } = await admin.from("retail_orders")
      .select("id,public_number,paid_at,created_at").in("customer_id", customerIds).eq("status", "confirmed")
      .not("paid_at", "is", null).order("paid_at", { ascending: false })
      .range(Math.max(offset, 0), Math.max(offset, 0) + Math.min(Math.max(limit, 1), 50) - 1);
    if (error) throw repositoryError("read confirmed purchases", error.code);
    const orderIds = (orders ?? []).map((row) => row.id);
    if (!orderIds.length) return [];
    const { data: lines, error: lineError } = await admin.from("retail_order_lines")
      .select("id,order_id,line_number,public_product_id,sku,product_name,slug_snapshot,image_url_snapshot,quantity,unit_code,unit_price,line_total,currency")
      .in("order_id", orderIds).order("line_number");
    if (lineError) throw repositoryError("read confirmed purchase lines", lineError.code);
    const orderById = new Map((orders ?? []).map((row) => [row.id, row]));
    return (lines ?? []).map((row): FinalCustomerPurchase => {
      const order = orderById.get(row.order_id)!;
      return { ...mapOrderLine(row), orderId: order.id, orderNumber: order.public_number, purchasedAt: order.paid_at ?? order.created_at, currentProduct: null };
    });
  }

  async findPurchase(customerIdentityId: string | null, lineId: string) {
    const admin = createAdminClient();
    const customerIds = await this.customerIds(customerIdentityId);
    if (!customerIds.length) return null;
    const { data: line, error } = await admin.from("retail_order_lines")
      .select("id,order_id,line_number,public_product_id,sku,product_name,slug_snapshot,image_url_snapshot,quantity,unit_code,unit_price,line_total,currency,retail_orders!inner(id,public_number,paid_at,created_at,status,customer_id)")
      .eq("id", lineId).in("retail_orders.customer_id", customerIds).eq("retail_orders.status", "confirmed").not("retail_orders.paid_at", "is", null).maybeSingle();
    if (error) throw repositoryError("read confirmed purchase", error.code);
    if (!line) return null;
    const orderValue = Array.isArray(line.retail_orders) ? line.retail_orders[0] : line.retail_orders;
    if (!orderValue) return null;
    const order = orderValue as { id: string; public_number: string; paid_at: string | null; created_at: string };
    return { ...mapOrderLine(line), orderId: order.id, orderNumber: order.public_number, purchasedAt: order.paid_at ?? order.created_at, currentProduct: null };
  }

  async listCurrentProducts(publicProductIds: string[]) {
    if (!publicProductIds.length) return [];
    const admin = createAdminClient();
    const { data: publication, error: publicationError } = await admin.from("public_retail_publications").select("id").eq("status", "published").maybeSingle();
    if (publicationError || !publication) return [];
    const [{ data: products, error }, { data: identities, error: identityError }] = await Promise.all([
      admin.from("public_retail_products").select("public_id,slug,name_ru,retail_price_amount,retail_price_currency,availability,primary_image_url").eq("publication_id", publication.id).in("public_id", publicProductIds),
      admin.from("public_retail_product_identities").select("public_id,source_product_id").in("public_id", publicProductIds),
    ]);
    if (error || identityError) throw repositoryError("read current retail products", error?.code ?? identityError?.code);
    const sourceByPublic = new Map((identities ?? []).map((row) => [row.public_id, row.source_product_id]));
    return (products ?? []).flatMap((row): FinalCustomerCurrentProduct[] => {
      const sourceProductId = sourceByPublic.get(row.public_id);
      return sourceProductId ? [{ publicProductId: row.public_id, sourceProductId, slug: row.slug, name: row.name_ru, price: Number(row.retail_price_amount), currency: row.retail_price_currency, availability: row.availability, imageUrl: row.primary_image_url }] : [];
    });
  }

  async listProductDocuments(sourceProductIds: string[]) {
    if (!sourceProductIds.length) return [];
    const { data, error } = await createAdminClient().from("catalog_product_documents")
      .select("id,product_id,title,document_type,url").in("product_id", sourceProductIds).eq("is_active", true).order("sort_order");
    if (error) throw repositoryError("read product documents", error.code);
    return (data ?? []).map((row): FinalCustomerProductDocument => ({ id: row.id, productId: row.product_id, title: row.title, type: row.document_type, url: row.url }));
  }

  async listServiceRequests(customerIdentityId: string | null, limit: number, offset = 0) {
    if (!customerIdentityId) return [];
    const { data, error } = await createAdminClient().rpc("list_customer_service_requests_summary_v1", {
      p_customer_identity_id: customerIdentityId,
      p_limit: Math.min(Math.max(limit, 1), 50),
      p_offset: Math.max(offset, 0),
    });
    if (error) throw repositoryError("read customer service requests", error.code);
    return ((data as Row[] | null) ?? []).map(mapServiceRequestSummary);
  }

  async findServiceRequest(customerIdentityId: string | null, requestId: string) {
    if (!customerIdentityId) return null;
    const { data, error } = await createAdminClient().from("customer_service_requests")
      .select(SERVICE_REQUEST_COLUMNS).eq("id", requestId).eq("customer_identity_id", customerIdentityId).maybeSingle();
    if (error) throw repositoryError("read customer service request", error.code);
    return data ? this.loadServiceRequestDetail(mapServiceRequest(data), false) : null;
  }

  async createServiceRequest(input: Parameters<FinalCustomerRepository["createServiceRequest"]>[0]) {
    const admin = createAdminClient();
    const { data: requestId, error } = await admin.rpc("create_customer_service_request_v2", {
      p_customer_account_id: input.accountId, p_customer_identity_id: input.customerIdentityId,
      p_actor_user_id: input.actorUserId, p_request_type: input.type, p_subject: input.subject,
      p_description: input.description, p_preferred_contact: input.preferredContact,
      p_customer_locale: input.locale,
      p_retail_order_id: input.orderId, p_retail_order_line_id: input.orderLineId,
    });
    if (error) throw repositoryError("create customer service request", error.code);
    const { data, error: readError } = await admin.from("customer_service_requests").select(SERVICE_REQUEST_COLUMNS).eq("id", requestId).single();
    if (readError) throw repositoryError("read created customer service request", readError.code);
    return mapServiceRequest(data);
  }

  async cancelServiceRequest(customerIdentityId: string, requestId: string, expectedVersion: number, actorUserId: string) {
    const { error } = await createAdminClient().rpc("cancel_customer_service_request_v1", {
      p_customer_identity_id: customerIdentityId, p_request_id: requestId,
      p_expected_version: expectedVersion, p_actor_user_id: actorUserId,
    });
    if (error) throw repositoryError("cancel customer service request", error.code);
  }

  async listAdminServiceRequests(limit: number, status: CustomerServiceRequestStatus | null) {
    let query = createAdminClient().from("customer_service_requests").select(SERVICE_REQUEST_COLUMNS).order("created_at", { ascending: false }).limit(Math.min(Math.max(limit, 1), 100));
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw repositoryError("read admin customer service requests", error.code);
    return (data ?? []).map(mapServiceRequest);
  }

  async findAdminServiceRequest(requestId: string) {
    const { data, error } = await createAdminClient().from("customer_service_requests").select(`${SERVICE_REQUEST_COLUMNS},customer_accounts!inner(display_name,email),retail_orders(public_number),retail_order_lines(product_name,sku)`).eq("id", requestId).maybeSingle();
    if (error) throw repositoryError("read admin customer service request", error.code);
    if (!data) return null;
    const account = firstRelation(data.customer_accounts);
    const order = firstRelation(data.retail_orders);
    const line = firstRelation(data.retail_order_lines);
    return this.loadServiceRequestDetail({ ...mapServiceRequest(data), customerDisplayName: textOrNull(account?.display_name), customerEmail: textOrNull(account?.email), relatedOrderNumber: textOrNull(order?.public_number), relatedProductName: line ? [line.sku, line.product_name].filter(Boolean).join(" · ") || null : null }, true);
  }

  async addCustomerServiceReply(input: Parameters<FinalCustomerRepository["addCustomerServiceReply"]>[0]) {
    const { data, error } = await createAdminClient().rpc("add_customer_service_reply_v1", {
      p_customer_identity_id: input.customerIdentityId, p_request_id: input.requestId,
      p_expected_version: input.expectedVersion, p_actor_user_id: input.actorUserId, p_body: input.body,
    });
    if (error || !data) throw repositoryError("add customer service reply", error?.code);
    return String(data);
  }

  async updateAdminServiceRequest(input: Parameters<FinalCustomerRepository["updateAdminServiceRequest"]>[0]) {
    const { data, error } = await createAdminClient().rpc("admin_update_customer_service_request_v2", {
      p_request_id: input.requestId, p_expected_version: input.expectedVersion, p_status: input.status ?? "",
      p_customer_reply: input.customerReply, p_internal_note: input.internalNote, p_actor_user_id: input.actorUserId,
    });
    if (error) throw repositoryError("update admin service request", error.code);
    const value = (data ?? {}) as Record<string, unknown>;
    const status = value.status ? String(value.status) : null;
    const eventCode: import("./notification-policy").CustomerServiceSmsEvent | null = status === "NEED_INFO" ? "CUSTOMER_SERVICE_NEED_INFO"
      : status === "RESOLVED" ? "CUSTOMER_SERVICE_RESOLVED"
      : value.messageId ? "CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH" : null;
    return {
      messageId: value.messageId ? String(value.messageId) : null,
      eventId: value.eventId ? String(value.eventId) : null,
      eventCode: eventCode === "CUSTOMER_SERVICE_NEED_INFO"
        || eventCode === "CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH"
        || eventCode === "CUSTOMER_SERVICE_RESOLVED" ? eventCode : null,
    };
  }

  async addServiceAttachment(input: Parameters<FinalCustomerRepository["addServiceAttachment"]>[0]) {
    const { data, error } = await createAdminClient().rpc("add_customer_service_attachment_v1", {
      p_request_id: input.requestId, p_message_id: input.messageId, p_actor_kind: input.actorKind,
      p_actor_user_id: input.actorUserId, p_customer_identity_id: input.customerIdentityId,
      p_visibility: input.visibility, p_storage_path: input.storagePath, p_file_name: input.fileName,
      p_content_type: input.contentType, p_size_bytes: input.sizeBytes, p_checksum_sha256: input.checksumSha256,
    });
    if (error || !data) throw repositoryError("add service attachment", error?.code);
    return String(data);
  }

  async listServiceNotifications(accountId: string, limit: number) {
    const { data, error } = await createAdminClient().from("customer_service_notifications")
      .select("id,request_id,event_code,action_path,read_at,created_at").eq("customer_account_id", accountId)
      .order("created_at", { ascending: false }).limit(Math.min(Math.max(limit, 1), 50));
    if (error) throw repositoryError("read service notifications", error.code);
    return (data ?? []).map(mapServiceNotification);
  }

  async markServiceNotificationRead(notificationId: string, actorUserId: string) {
    const { error } = await createAdminClient().rpc("mark_customer_service_notification_read_v1", {
      p_notification_id: notificationId, p_actor_user_id: actorUserId,
    });
    if (error) throw repositoryError("mark service notification read", error.code);
  }

  private async loadServiceRequestDetail(
    request: CustomerServiceRequest & Partial<Pick<CustomerServiceRequestDetail,
      "customerDisplayName" | "customerEmail" | "relatedOrderNumber" | "relatedProductName">>,
    includeInternal: boolean,
  ): Promise<CustomerServiceRequestDetail> {
    const admin = createAdminClient();
    let messagesQuery = admin.from("customer_service_messages")
      .select("id,author_type,visibility,body,created_at").eq("request_id", request.id).order("created_at").limit(200);
    let attachmentsQuery = admin.from("customer_service_attachments")
      .select("id,message_id,uploaded_by_kind,visibility,file_name,content_type,size_bytes,created_at").eq("request_id", request.id).order("created_at").limit(5);
    let eventsQuery = admin.from("customer_service_request_events").select("id,actor_kind,event_type,from_status,to_status,created_at")
      .eq("request_id", request.id).order("created_at").limit(250);
    if (!includeInternal) {
      messagesQuery = messagesQuery.eq("visibility", "CUSTOMER_VISIBLE");
      attachmentsQuery = attachmentsQuery.eq("visibility", "CUSTOMER_VISIBLE");
      eventsQuery = eventsQuery.neq("event_type", "INTERNAL_NOTE_ADDED").neq("event_type", "INTERNAL_ATTACHMENT_ADDED");
    }
    const [{ data: messages, error: messageError }, { data: attachments, error: attachmentError }, { data: events, error: eventError }] = await Promise.all([
      messagesQuery, attachmentsQuery,
      eventsQuery,
    ]);
    if (messageError || attachmentError || eventError) throw repositoryError("read service detail", messageError?.code ?? attachmentError?.code ?? eventError?.code);
    return { ...request, messages: (messages ?? []).map(mapServiceMessage), attachments: (attachments ?? []).map(mapServiceAttachment), timeline: (events ?? []).map(mapServiceTimelineEvent) };
  }

  async updateProfile(accountId: string, displayName: string | null, email: string | null) {
    const admin = createAdminClient();
    const { error } = await admin.from("customer_accounts").update({
      display_name: displayName,
      email,
    }).eq("id", accountId);
    if (error) throw repositoryError("update profile", error.code);
    const { error: eventError } = await admin.from("customer_account_events").insert({
      customer_account_id: accountId,
      event_type: "PROFILE_UPDATED",
      safe_metadata: {
        displayNamePresent: Boolean(displayName),
        emailPresent: Boolean(email),
      },
    });
    if (eventError) throw repositoryError("record profile event", eventError.code);
  }
}

const SERVICE_REQUEST_COLUMNS = "id,public_number,request_type,subject,description,preferred_contact,status,retail_order_id,retail_order_line_id,created_at,updated_at,version";

type Row = Record<string, unknown>;

function mapAccount(row: Row): FinalCustomerAccount {
  return {
    id: String(row.id),
    authUserId: String(row.auth_user_id),
    customerIdentityId: row.customer_identity_id ? String(row.customer_identity_id) : null,
    status: row.status as FinalCustomerAccount["status"],
    identityResolutionStatus: row.identity_resolution_status as FinalCustomerAccount["identityResolutionStatus"],
    displayName: row.display_name ? String(row.display_name) : null,
    email: row.email ? String(row.email) : null,
    createdAt: String(row.created_at),
    lastLoginAt: String(row.last_login_at),
  };
}

function mapOrder(row: Row, itemCount: number, itemSummary: readonly string[] = [], previewImageUrl: string | null = null): FinalCustomerOrderSummary {
  return { id: String(row.id), number: String(row.public_number), status: String(row.status), createdAt: String(row.created_at), total: Number(row.priced_scope_total), currency: String(row.currency), itemCount, itemSummary, previewImageUrl, paidAt: row.paid_at ? String(row.paid_at) : null, paymentState: row.paid_at ? "PAID" : "UNPAID" };
}

function mapOrderLine(row: Row): FinalCustomerOrderLine {
  return { id: String(row.id), lineNumber: Number(row.line_number), publicProductId: String(row.public_product_id), sku: String(row.sku), name: String(row.product_name), slug: String(row.slug_snapshot), imageUrl: row.image_url_snapshot ? String(row.image_url_snapshot) : null, quantity: Number(row.quantity), unitCode: String(row.unit_code), unitPrice: Number(row.unit_price), lineTotal: Number(row.line_total), currency: String(row.currency) };
}

function mapServiceRequest(row: Row): CustomerServiceRequest {
  return { id: String(row.id), number: String(row.public_number), type: row.request_type as CustomerServiceRequest["type"], subject: String(row.subject), description: String(row.description), preferredContact: row.preferred_contact as CustomerServiceRequest["preferredContact"], status: row.status as CustomerServiceRequest["status"], orderId: row.retail_order_id ? String(row.retail_order_id) : null, orderLineId: row.retail_order_line_id ? String(row.retail_order_line_id) : null, createdAt: String(row.created_at), updatedAt: String(row.updated_at), version: Number(row.version) };
}

function mapServiceRequestSummary(row: Row): CustomerServiceRequest {
  return { id: String(row.id), number: String(row.number), type: row.type as CustomerServiceRequest["type"], subject: String(row.subject), description: String(row.description), preferredContact: row.preferredContact as CustomerServiceRequest["preferredContact"], status: row.status as CustomerServiceRequest["status"], orderId: row.orderId ? String(row.orderId) : null, orderLineId: row.orderLineId ? String(row.orderLineId) : null, createdAt: String(row.createdAt), updatedAt: String(row.updatedAt), version: Number(row.version), latestMessage: row.latestMessage ? String(row.latestMessage) : null, latestMessageAuthor: row.latestMessageAuthor as CustomerServiceRequest["latestMessageAuthor"], latestMessageAt: row.latestMessageAt ? String(row.latestMessageAt) : null };
}

function mapServiceMessage(row: Row): CustomerServiceMessage { return { id: String(row.id), authorType: row.author_type as CustomerServiceMessage["authorType"], visibility: row.visibility as CustomerServiceMessage["visibility"], body: String(row.body), createdAt: String(row.created_at) }; }
function mapServiceAttachment(row: Row): CustomerServiceAttachment { return { id: String(row.id), messageId: row.message_id ? String(row.message_id) : null, uploadedByKind: row.uploaded_by_kind as CustomerServiceAttachment["uploadedByKind"], visibility: row.visibility as CustomerServiceAttachment["visibility"], fileName: String(row.file_name), contentType: String(row.content_type), sizeBytes: Number(row.size_bytes), createdAt: String(row.created_at) }; }
function mapServiceTimelineEvent(row: Row): CustomerServiceTimelineEvent { return { id: String(row.id), actorKind: row.actor_kind as CustomerServiceTimelineEvent["actorKind"], eventType: String(row.event_type), fromStatus: row.from_status as CustomerServiceRequestStatus | null, toStatus: row.to_status as CustomerServiceRequestStatus | null, createdAt: String(row.created_at) }; }
function mapServiceNotification(row: Row): CustomerServiceNotification { return { id: String(row.id), requestId: String(row.request_id), eventCode: row.event_code as CustomerServiceNotification["eventCode"], actionPath: String(row.action_path), readAt: row.read_at ? String(row.read_at) : null, createdAt: String(row.created_at) }; }
function firstRelation(value: unknown): Row | null { if (Array.isArray(value)) return value[0] as Row | undefined ?? null; return value && typeof value === "object" ? value as Row : null; }
function textOrNull(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }

function repositoryError(operation: string, code?: string) {
  return new Error(`Final Customer repository ${operation} failed: ${code ?? "UNKNOWN"}`);
}
