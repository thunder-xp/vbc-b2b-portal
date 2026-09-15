import type { CustomerServiceRequestStatus } from "./types";

const ADMIN_TRANSITIONS: Readonly<Record<CustomerServiceRequestStatus, readonly CustomerServiceRequestStatus[]>> = Object.freeze({
  NEW: ["IN_REVIEW", "CANCELLED"],
  IN_REVIEW: ["NEED_INFO", "ACCEPTED", "CANCELLED"],
  NEED_INFO: ["IN_REVIEW", "CANCELLED"],
  ACCEPTED: ["RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
});

export function allowedAdminServiceTransitions(status: CustomerServiceRequestStatus) {
  return ADMIN_TRANSITIONS[status];
}

export function customerServiceReplyAllowed(status: CustomerServiceRequestStatus) {
  return ["NEW", "IN_REVIEW", "NEED_INFO", "ACCEPTED"].includes(status);
}

export function customerServiceCancelAllowed(status: CustomerServiceRequestStatus) {
  return ["NEW", "IN_REVIEW", "NEED_INFO"].includes(status);
}
