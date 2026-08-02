import type { AdminPartnerMembership } from "../types";

export function partitionAdminMemberships(memberships: AdminPartnerMembership[]): {
  active: AdminPartnerMembership[];
  history: AdminPartnerMembership[];
} {
  return memberships.reduce<{ active: AdminPartnerMembership[]; history: AdminPartnerMembership[] }>(
    (result, membership) => {
      result[membership.status === "active" ? "active" : "history"].push(membership);
      return result;
    },
    { active: [], history: [] },
  );
}
