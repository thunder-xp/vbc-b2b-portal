import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/src/modules/access-control/actions/service-factory";
import { UnauthenticatedError } from "@/src/modules/access-control/services";
import { agentCabinetCopy, agentLifecycleStatusCopy, getAgentCabinetContext, getAgentCabinetLocale } from "@/src/modules/agent-cabinet";
import { AgentNavigation } from "@/src/modules/agent-cabinet/components/AgentNavigation";
import { StatusGate } from "@/src/modules/agent-cabinet/components/StatusGate";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AgentLayout({ children }: { children: ReactNode }) {
  await authenticatedAgentUser();
  const [agent, locale] = await Promise.all([getAgentCabinetContext(), getAgentCabinetLocale()]);
  if (!agent) notFound();
  const copy = agentCabinetCopy[locale];
  return <div className="min-h-screen bg-zinc-50 text-zinc-950"><header className="border-b border-zinc-200 bg-white"><div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{copy.role}</p><p className="truncate font-semibold">{agent.displayName}</p></div><div className="shrink-0 text-right"><p className="font-mono text-xs text-zinc-500">{agent.agentCode}</p><p className="text-sm">{agentLifecycleStatusCopy[locale][agent.status]}</p></div></div></header>{agent.accessMode === "OPERATIONAL" ? <><AgentNavigation locale={locale}/>{children}</> : <StatusGate context={agent} locale={locale}/>}</div>;
}

async function authenticatedAgentUser() { try { return await getAuthenticatedUser(); } catch (error) { if (error instanceof UnauthenticatedError) redirect("/auth/sign-in"); throw error; } }
