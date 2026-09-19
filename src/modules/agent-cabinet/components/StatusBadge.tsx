import { agentReferralStatusCopy, type AgentCabinetLocale } from "../copy";
import type { AgentReferralStatus } from "../../agent-domain";
import { CabinetStatusBadge, type CabinetStatusTone } from "@/src/modules/cabinet-experience/components";

export function ReferralStatusBadge({ status, locale = "ru" }: { status: AgentReferralStatus; locale?: AgentCabinetLocale }) {
  return <CabinetStatusBadge label={agentReferralStatusCopy[locale][status]} tone={referralTone(status)} />;
}

export function AgentStatusBadge({ label, tone = "neutral" }: { label: string; tone?: CabinetStatusTone }) {
  return <CabinetStatusBadge label={label} tone={tone} />;
}

function referralTone(status: AgentReferralStatus): CabinetStatusTone {
  if (status === "ACTIVE" || status === "VERIFIED") return "success";
  if (status === "CONFLICT" || status === "EXISTING_CUSTOMER") return "attention";
  if (status === "REJECTED") return "danger";
  if (status === "CAPTURED" || status === "PENDING_REVIEW") return "pending";
  return "neutral";
}
