import { redirect } from "next/navigation";

import {
  AccessContextAuthenticationError,
  decidePostSignInBusinessRoute,
  resolveCurrentBusinessAccess,
} from "@/src/modules/auth/access-context";
import { LocalizedAccessState } from "@/src/modules/auth/components";

export default async function BusinessAccessStatePage() {
  let resolution: Awaited<ReturnType<typeof resolveCurrentBusinessAccess>>;
  try {
    resolution = await resolveCurrentBusinessAccess();
  } catch (error) {
    if (error instanceof AccessContextAuthenticationError) redirect("/auth/sign-in");
    throw error;
  }
  const decision = decidePostSignInBusinessRoute(resolution);
  if (decision.kind !== "ACCESS_STATE") redirect(decision.targetRoute);
  return <LocalizedAccessState kind="BUSINESS_UNAVAILABLE" />;
}
