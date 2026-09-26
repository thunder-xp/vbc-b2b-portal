export type AdminActionLevel =
  | "CRITICAL"
  | "ACTION_REQUIRED"
  | "WAITING"
  | "INFO";

export type AdminActionDomain =
  | "integration"
  | "service"
  | "onboarding"
  | "agent"
  | "finance";

export type AdminActionKind =
  | "operational_issue"
  | "service_attention"
  | "partner_review"
  | "agent_application"
  | "agent_reward_payout";

export interface AdminActionItem {
  id: string;
  situationKey: string;
  signalCount: number;
  domain: AdminActionDomain;
  kind: AdminActionKind;
  level: AdminActionLevel;
  title: string;
  explanation: string;
  entityLabel: string | null;
  createdAt: string;
  actionLabel: string;
  actionHref: string;
  permission: string;
}

export interface AdminActionSourceWarning {
  source: AdminActionDomain;
  label: string;
}

export interface AdminActionCenter {
  items: readonly AdminActionItem[];
  actionableCount: number;
  waitingCount: number;
  hasMore: boolean;
  generatedAt: string;
  sourceWarnings: readonly AdminActionSourceWarning[];
}
