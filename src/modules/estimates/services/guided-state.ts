import type { EstimateCartConversionEvidence } from "../repositories";
import type {
  EstimateGuidedStateDto,
  EstimateLifecycleStatus,
  EstimateVersionStatus,
  ProposalDeliveryStatus,
} from "../types";

export type EstimateGuidedStateInput = {
  lifecycleStatus: EstimateLifecycleStatus;
  estimateStatus: "draft" | "ready" | "archived";
  lifecycleOrderId: string | null;
  versionId: string | null;
  versionStatus: EstimateVersionStatus | null;
  acceptedVersionId: string | null;
  readyDocumentId: string | null;
  currentVersion: boolean;
  hasDeliveryHistory: boolean;
  latestDelivery: null | {
    status: ProposalDeliveryStatus;
    openedAt: string | null;
    response: "accepted" | "rejected" | null;
  };
  productRequirements: Array<{ productId: string; quantity: number }>;
  cartConversions: EstimateCartConversionEvidence[];
  companyId: string;
  userId: string;
  permissions: {
    canManage: boolean;
    canSend: boolean;
    canConvert: boolean;
    canManageOrders: boolean;
  };
};

export function deriveEstimateGuidedState(input: EstimateGuidedStateInput): EstimateGuidedStateDto {
  if (input.lifecycleStatus === "converted_to_order") {
    return result(input, "converted_to_order", input.lifecycleOrderId ? "open_order" : null);
  }
  if (input.lifecycleStatus === "rejected" || input.versionStatus === "rejected") {
    return result(input, "rejected", null);
  }
  if (input.lifecycleStatus === "expired") {
    return result(input, "expired", input.permissions.canManage ? "update" : null);
  }
  const accepted = input.lifecycleStatus === "accepted"
    && input.versionStatus === "accepted"
    && input.versionId !== null
    && input.acceptedVersionId === input.versionId;
  if (accepted) {
    const resumableCartId = findResumableCartId(input);
    if (resumableCartId && input.permissions.canConvert && input.permissions.canManageOrders) {
      return result(input, "resume_checkout", "resume_checkout", resumableCartId);
    }
    if (hasVersionConversion(input.cartConversions, input.versionId)) {
      return result(input, "accepted_already_converted", null);
    }
    return input.permissions.canConvert && input.permissions.canManageOrders
      ? result(input, "accepted_ready_to_order", "continue_order")
      : result(input, "accepted_ready_to_order", null);
  }
  if (input.versionStatus === "sent" && input.lifecycleStatus === "sent") {
    const opened = Boolean(
      input.latestDelivery
      && !input.latestDelivery.response
      && ["sent", "delivered"].includes(input.latestDelivery.status)
      && input.latestDelivery.openedAt,
    );
    return result(input, opened ? "awaiting_customer_opened" : "awaiting_customer", null);
  }
  if (
    input.versionStatus === "prepared"
    && input.lifecycleStatus === "draft"
    && input.readyDocumentId
  ) {
    return input.permissions.canSend && input.currentVersion
      ? result(input, "ready_to_send", "send")
      : result(input, "ready_to_send", null);
  }
  return result(input, "draft", null);
}

function result(
  input: EstimateGuidedStateInput,
  state: EstimateGuidedStateDto["state"],
  primaryAction: EstimateGuidedStateDto["primaryAction"],
  resumeCartId: string | null = null,
): EstimateGuidedStateDto {
  const secondaryActions: EstimateGuidedStateDto["secondaryActions"] = [];
  if (input.versionId) secondaryActions.push("preview", "pdf");
  if (input.hasDeliveryHistory) secondaryActions.push("delivery_history");
  if (input.permissions.canManage) {
    secondaryActions.push("duplicate", "save_template");
    if (input.estimateStatus === "draft") secondaryActions.push("mark_ready");
    if (input.versionStatus === "prepared" && input.lifecycleStatus === "draft" && input.readyDocumentId) secondaryActions.push("mark_sent");
    if (input.versionStatus === "sent" && input.lifecycleStatus === "sent") secondaryActions.push("record_response");
  }
  if (
    input.permissions.canSend
    && input.currentVersion
    && input.versionStatus === "prepared"
    && primaryAction !== "send"
  ) secondaryActions.push("send");
  if (
    input.permissions.canSend
    && input.currentVersion
    && input.versionStatus === "sent"
    && ["awaiting_customer", "awaiting_customer_opened"].includes(state)
  ) secondaryActions.push("resend");
  return { state, primaryAction, secondaryActions, resumeCartId };
}

function findResumableCartId(input: EstimateGuidedStateInput): string | null {
  const requirements = aggregateQuantities(input.productRequirements);
  if (!requirements.size || !input.versionId) return null;
  for (const conversion of input.cartConversions) {
    const cart = conversion.cart;
    if (
      conversion.direction !== "estimate_to_cart"
      || conversion.versionId !== input.versionId
      || conversion.createdBy !== input.userId
      || !cart
      || cart.companyId !== input.companyId
      || cart.createdBy !== input.userId
      || cart.status !== "active"
    ) continue;
    const cartQuantities = aggregateQuantities(cart.items);
    if ([...requirements].every(([productId, quantity]) => (cartQuantities.get(productId) ?? 0) >= quantity)) {
      return cart.id;
    }
  }
  return null;
}

function hasVersionConversion(conversions: EstimateCartConversionEvidence[], versionId: string | null): boolean {
  return conversions.some((conversion) =>
    conversion.direction === "estimate_to_cart" && conversion.versionId === versionId,
  );
}

function aggregateQuantities(items: Array<{ productId: string; quantity: number }>): Map<string, number> {
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (!item.productId || !Number.isFinite(item.quantity) || item.quantity <= 0) continue;
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }
  return quantities;
}
