import "server-only";

import type { UserMetadata } from "@supabase/supabase-js";

import { createCommercialAgentApplicationService } from "@/src/modules/agent-application";
import { resolveInternalPostSignInDestination } from "@/src/modules/admin/services";

import { createBusinessAccessResolver, decideBusinessRoute } from "./access-context";

export type PostSignInAccessKind =
  | "INTERNAL"
  | "PARTNER_OR_AGENT_WORKSPACE"
  | "AGENT_APPLICATION"
  | "PARTNER_ONBOARDING"
  | "NONE";

export type PostSignInAccessDecision = Readonly<{
  kind: PostSignInAccessKind;
  targetRoute: string;
}>;

const APPLICATION_STATUSES = new Set(["DRAFT", "SUBMITTED", "NEEDS_CLARIFICATION", "APPROVED"]);

export async function resolvePostSignInAccess(
  userId: string,
  metadata: UserMetadata | null | undefined,
): Promise<PostSignInAccessDecision> {
  let internalDestination: string | null = null;
  try {
    internalDestination = await resolveInternalPostSignInDestination(userId);
  } catch {
    // Internal access fails closed without preventing a legitimate external
    // Partner or Agent identity from resolving through its own authority.
  }
  if (internalDestination) return { kind: "INTERNAL", targetRoute: internalDestination };

  const business = await createBusinessAccessResolver().resolve(userId);
  const businessDecision = decideBusinessRoute(business);
  if (businessDecision.kind !== "ACCESS_STATE") {
    return { kind: "PARTNER_OR_AGENT_WORKSPACE", targetRoute: businessDecision.targetRoute };
  }

  const application = await createCommercialAgentApplicationService().getApplicantApplication(userId);
  if (application && APPLICATION_STATUSES.has(application.status)) {
    return { kind: "AGENT_APPLICATION", targetRoute: preferredAgentApplicationRoute(metadata) };
  }

  if (application) return { kind: "NONE", targetRoute: businessDecision.targetRoute };

  if (registrationIntent(metadata) === "agent") {
    return { kind: "AGENT_APPLICATION", targetRoute: preferredAgentApplicationRoute(metadata) };
  }
  if (registrationIntent(metadata) === "installer") {
    return { kind: "PARTNER_ONBOARDING", targetRoute: preferredPartnerOnboardingRoute(metadata) };
  }

  return { kind: "NONE", targetRoute: businessDecision.targetRoute };
}

function registrationIntent(metadata: UserMetadata | null | undefined): "agent" | "installer" | null {
  return metadata?.registration_intent === "agent" || metadata?.registration_intent === "installer"
    ? metadata.registration_intent
    : null;
}

function preferredLocale(metadata: UserMetadata | null | undefined): "ru" | "ro" {
  return metadata?.preferred_registration_locale === "ro" ? "ro" : "ru";
}

function preferredAgentApplicationRoute(metadata: UserMetadata | null | undefined) {
  return `/become-partner/agent?lang=${preferredLocale(metadata)}`;
}

function preferredPartnerOnboardingRoute(metadata: UserMetadata | null | undefined) {
  return `/onboarding/profile?lang=${preferredLocale(metadata)}`;
}
