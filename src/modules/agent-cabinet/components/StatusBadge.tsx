import { agentReferralStatusCopy, type AgentCabinetLocale } from "../copy";
import type { AgentReferralStatus } from "../../agent-domain";

export function ReferralStatusBadge({ status, locale = "ru" }: { status: AgentReferralStatus; locale?: AgentCabinetLocale }) {
  const attention = ["CONFLICT", "REJECTED", "EXISTING_CUSTOMER"].includes(status);
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${attention ? "border-amber-300 bg-amber-50 text-amber-900" : "border-zinc-200 bg-zinc-50 text-zinc-700"}`}>{agentReferralStatusCopy[locale][status]}</span>;
}
