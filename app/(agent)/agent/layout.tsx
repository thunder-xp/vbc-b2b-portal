import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/src/modules/access-control/actions/service-factory";
import { UnauthenticatedError } from "@/src/modules/access-control/services";
import { createAgentDomainService } from "@/src/modules/agent-domain";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AgentLayout({ children }: { children: ReactNode }) {
  const user = await authenticatedAgentUser();
  const agent = await createAgentDomainService().getAgentWorkspace(user.id);
  if (!agent) notFound();
  return <div className="min-h-screen bg-zinc-50 text-zinc-950"><header className="border-b border-zinc-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Коммерческий агент</p><p className="font-semibold">{agent.displayName}</p></div><div className="text-right"><p className="font-mono text-xs text-zinc-500">{agent.agentCode}</p><p className="text-sm">{agent.status}</p></div></div></header>{children}</div>;
}

async function authenticatedAgentUser() {
  try {
    return await getAuthenticatedUser();
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/auth/sign-in");
    throw error;
  }
}
