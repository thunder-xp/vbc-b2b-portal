import { redirect } from "next/navigation";

import {
  AccessContextAuthenticationError,
  decideBusinessRoute,
  isUnifiedBusinessRoutingEnabled,
  resolveCurrentBusinessAccess,
} from "@/src/modules/auth/access-context";
import { BusinessContextSelector } from "@/src/modules/auth/components";

export default async function SelectBusinessContextPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!isUnifiedBusinessRoutingEnabled()) redirect("/cabinet");
  let resolution: Awaited<ReturnType<typeof resolveCurrentBusinessAccess>>;
  try {
    resolution = await resolveCurrentBusinessAccess();
  } catch (error) {
    if (error instanceof AccessContextAuthenticationError) redirect("/auth");
    throw error;
  }
  const available = resolution.contexts.filter((context) => context.status === "AVAILABLE");
  if (available.length === 0) redirect("/auth/business-access-state");
  const decision = decideBusinessRoute({ ...resolution, preferredContext: null });
  if (decision.kind === "ROUTE") redirect(decision.targetRoute);
  const query = await searchParams;
  return <BusinessContextSelector contexts={available} unavailable={query.error === "unavailable"} />;
}
