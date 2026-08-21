export const PARTNER_NOTIFICATION_EVENT_CODES = [
  "order_submitted",
  "order_confirmed",
  "order_requires_attention",
  "order_readback_failed",
  "order_reconciliation_required",
  "order_posted",
  "order_cancelled",
  "shipment_due_in_3_days",
  "shipment_due_today",
  "shipment_overdue",
  "shipment_date_changed",
  "date_change_approved",
  "date_change_rejected",
  "date_change_cancelled",
  "invitation_expiring",
  "invitation_accepted",
  "employee_suspended",
  "role_changed",
  "price_access_changed",
  "onboarding_approved",
  "onboarding_access_opened",
  "watched_product_back_in_stock",
  "watched_product_expected_arrival_added",
  "watched_product_arrived",
  "watched_product_price_changed",
  "cart_product_price_changed",
  "cart_product_availability_changed",
  "campaign_started",
  "campaign_ending_soon",
  "new_invoice_available",
  "reconciliation_statement_available",
  "order_document_available",
  "product_document_updated",
  "document_expiring",
  "warehouse_arrival_completed",
  "service_case_created",
  "service_case_accepted",
  "service_information_requested",
  "service_equipment_expected",
  "service_equipment_received",
  "service_diagnosis_started",
  "service_diagnosis_completed",
  "service_repair_started",
  "service_replacement_approved",
  "service_replacement_waiting",
  "service_ready_for_pickup",
  "service_case_closed",
  "service_case_rejected",
  "service_case_cancelled",
  "support_ticket_created",
  "support_ticket_accepted",
  "support_ticket_reply",
  "support_information_requested",
  "support_solution_proposed",
  "support_ticket_resolved",
  "support_ticket_closed",
  "support_ticket_rejected",
  "service_history_accepted",
  "service_history_ready_for_pickup",
  "service_history_issued",
  "installation_offer",
] as const;

export type PartnerNotificationEventCode =
  (typeof PARTNER_NOTIFICATION_EVENT_CODES)[number];

export const PARTNER_NOTIFICATION_GROUPS = [
  "orders",
  "shipments",
  "company_access",
  "products",
  "commercial",
  "documents",
  "service",
  "support",
  "installation",
] as const;

export type PartnerNotificationGroup =
  (typeof PARTNER_NOTIFICATION_GROUPS)[number];

export const PARTNER_NOTIFICATION_SEVERITIES = [
  "critical",
  "warning",
  "information",
  "success",
] as const;

export type PartnerNotificationSeverity =
  (typeof PARTNER_NOTIFICATION_SEVERITIES)[number];

type EventDefinition = {
  group: PartnerNotificationGroup;
  severity: PartnerNotificationSeverity;
  mandatory: boolean;
  entityType:
    | "order"
    | "shipment"
    | "date_change"
    | "invitation"
    | "membership"
    | "access_request"
    | "product"
    | "cart"
    | "campaign"
    | "warehouse_arrival"
    | "document"
    | "service_case"
    | "support_ticket"
    | "service_history"
    | "installation_assignment_attempt";
  expiryDays: number;
};

export const PARTNER_NOTIFICATION_EVENT_CATALOG = {
  order_submitted: definition("orders", "success", false, "order", 90),
  order_confirmed: definition("orders", "success", false, "order", 90),
  order_requires_attention: definition("orders", "warning", false, "order", 180),
  order_readback_failed: definition("orders", "critical", true, "order", 180),
  order_reconciliation_required: definition("orders", "critical", true, "order", 180),
  order_posted: definition("orders", "success", false, "order", 90),
  order_cancelled: definition("orders", "warning", false, "order", 90),
  shipment_due_in_3_days: definition("shipments", "information", false, "shipment", 33),
  shipment_due_today: definition("shipments", "warning", false, "shipment", 30),
  shipment_overdue: definition("shipments", "critical", true, "shipment", 30),
  shipment_date_changed: definition("shipments", "information", false, "shipment", 90),
  date_change_approved: definition("shipments", "success", false, "date_change", 90),
  date_change_rejected: definition("shipments", "warning", false, "date_change", 90),
  date_change_cancelled: definition("shipments", "information", false, "date_change", 90),
  invitation_expiring: definition("company_access", "warning", false, "invitation", 30),
  invitation_accepted: definition("company_access", "success", false, "invitation", 90),
  employee_suspended: definition("company_access", "critical", true, "membership", 180),
  role_changed: definition("company_access", "information", true, "membership", 180),
  price_access_changed: definition("company_access", "warning", true, "membership", 180),
  onboarding_approved: definition("company_access", "success", true, "access_request", 90),
  onboarding_access_opened: definition("company_access", "success", true, "access_request", 90),
  watched_product_back_in_stock: definition("products", "success", false, "product", 30),
  watched_product_expected_arrival_added: definition(
    "products",
    "information",
    false,
    "product",
    30,
  ),
  watched_product_arrived: definition("products", "success", false, "product", 30),
  watched_product_price_changed: definition("products", "information", false, "product", 30),
  cart_product_price_changed: definition("products", "warning", true, "cart", 30),
  cart_product_availability_changed: definition("products", "warning", true, "cart", 30),
  campaign_started: definition("commercial", "information", false, "campaign", 90),
  campaign_ending_soon: definition("commercial", "information", false, "campaign", 30),
  new_invoice_available: definition("documents", "information", false, "document", 180),
  reconciliation_statement_available: definition("documents", "information", false, "document", 180),
  order_document_available: definition("documents", "information", false, "document", 180),
  product_document_updated: definition("documents", "information", false, "document", 90),
  document_expiring: definition("documents", "warning", false, "document", 30),
  warehouse_arrival_completed: definition("commercial", "success", false, "warehouse_arrival", 90),
  service_case_created: definition("service", "information", false, "service_case", 90),
  service_case_accepted: definition("service", "information", false, "service_case", 90),
  service_information_requested: definition("service", "warning", false, "service_case", 90),
  service_equipment_expected: definition("service", "information", false, "service_case", 90),
  service_equipment_received: definition("service", "information", false, "service_case", 90),
  service_diagnosis_started: definition("service", "information", false, "service_case", 90),
  service_diagnosis_completed: definition("service", "information", false, "service_case", 90),
  service_repair_started: definition("service", "information", false, "service_case", 90),
  service_replacement_approved: definition("service", "success", false, "service_case", 90),
  service_replacement_waiting: definition("service", "information", false, "service_case", 90),
  service_ready_for_pickup: definition("service", "success", false, "service_case", 90),
  service_case_closed: definition("service", "success", false, "service_case", 90),
  service_case_rejected: definition("service", "warning", false, "service_case", 90),
  service_case_cancelled: definition("service", "information", false, "service_case", 90),
  support_ticket_created: definition("support", "information", false, "support_ticket", 90),
  support_ticket_accepted: definition("support", "information", false, "support_ticket", 90),
  support_ticket_reply: definition("support", "information", false, "support_ticket", 90),
  support_information_requested: definition("support", "warning", false, "support_ticket", 90),
  support_solution_proposed: definition("support", "information", false, "support_ticket", 90),
  support_ticket_resolved: definition("support", "success", false, "support_ticket", 90),
  support_ticket_closed: definition("support", "success", false, "support_ticket", 90),
  support_ticket_rejected: definition("support", "warning", false, "support_ticket", 90),
  service_history_accepted: definition("service", "information", false, "service_history", 90),
  service_history_ready_for_pickup: definition("service", "success", false, "service_history", 90),
  service_history_issued: definition("service", "success", false, "service_history", 90),
  installation_offer: definition("installation", "information", false, "installation_assignment_attempt", 30),
} satisfies Record<PartnerNotificationEventCode, EventDefinition>;

function definition(
  group: PartnerNotificationGroup,
  severity: PartnerNotificationSeverity,
  mandatory: boolean,
  entityType: EventDefinition["entityType"],
  expiryDays: number,
): EventDefinition {
  return Object.freeze({ group, severity, mandatory, entityType, expiryDays });
}
