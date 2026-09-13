import { referralStatusCopy } from "../copy";
import type { AgentReferralStatus } from "../../agent-domain";

export function ReferralStatusBadge({ status }: { status: AgentReferralStatus }) {
  const attention = ["CONFLICT", "REJECTED", "EXISTING_CUSTOMER"].includes(status);
  return <span className={`inline-flex border px-2 py-1 text-xs font-medium ${attention ? "border-amber-300 bg-amber-50 text-amber-900" : "border-zinc-200 bg-zinc-50 text-zinc-700"}`}>{referralStatusCopy[status]}</span>;
}
