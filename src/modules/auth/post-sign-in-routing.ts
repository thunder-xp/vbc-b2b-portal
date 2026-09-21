import "server-only";

import type { UserMetadata } from "@supabase/supabase-js";

import { createCommercialAgentApplicationService } from "@/src/modules/agent-application";
import { resolveInternalPostSignInDestination } from "@/src/modules/admin/services";

import { createBusinessAccessResolver, decidePostSignInBusinessRoute } from "./access-context";
import type { BusinessAccessResolution, BusinessRouteDecision } from "./access-context";
import type { BusinessWorkspace, PostSignInContinuation } from "./redirects";

export type PostSignInAccessKind =
  | "INTERNAL"
  | "PARTNER_OR_AGENT_WORKSPACE"
  | "AGENT_APPLICATION"
  | "PARTNER_ONBOARDING"
  | "NONE";

export type PostSignInAccessDecision = Readonly<{
  kind: PostSignInAccessKind;
  targetRoute: string;
  requiresBusinessPhoneEnrollment: boolean;
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
  if (internalDestination) {
    return { kind: "INTERNAL", targetRoute: internalDestination, requiresBusinessPhoneEnrollment: false };
  }

  const business = await createBusinessAccessResolver().resolve(userId);
  const businessDecision = decidePostSignInBusinessRoute(business);
  if (businessDecision.kind !== "ACCESS_STATE") {
    return {
      kind: "PARTNER_OR_AGENT_WORKSPACE",
      targetRoute: businessDecision.targetRoute,
      requiresBusinessPhoneEnrollment: requiresOperationalBusinessPhone(business, businessDecision),
    };
  }

  const application = await createCommercialAgentApplicationService().getApplicantApplication(userId);
  if (application && APPLICATION_STATUSES.has(application.status)) {
    return {
      kind: "AGENT_APPLICATION",
      targetRoute: preferredAgentApplicationRoute(metadata),
      requiresBusinessPhoneEnrollment: false,
    };
  }

  if (application) {
    return { kind: "NONE", targetRoute: businessDecision.targetRoute, requiresBusinessPhoneEnrollment: false };
  }

  if (registrationIntent(metadata) === "agent") {
    return {
      kind: "AGENT_APPLICATION",
      targetRoute: preferredAgentApplicationRoute(metadata),
      requiresBusinessPhoneEnrollment: false,
    };
  }
  if (registrationIntent(metadata) === "installer") {
    return {
      kind: "PARTNER_ONBOARDING",
      targetRoute: preferredPartnerOnboardingRoute(metadata),
      requiresBusinessPhoneEnrollment: false,
    };
  }

  return { kind: "NONE", targetRoute: businessDecision.targetRoute, requiresBusinessPhoneEnrollment: false };
}

export function resolveAuthorizedPostSignInTarget(
  decision: PostSignInAccessDecision,
  continuation: PostSignInContinuation | null,
): string {
  if (!continuation || continuation.kind === "DISCARD") return decision.targetRoute;
  if (continuation.kind === "GENERAL_NAVIGATION") return continuation.path;
  if (continuation.kind !== "WORKSPACE") return decision.targetRoute;
  return workspaceForDecision(decision) === continuation.workspace
    ? continuation.path
    : decision.targetRoute;
}

function requiresOperationalBusinessPhone(
  resolution: BusinessAccessResolution,
  decision: BusinessRouteDecision,
) {
  if (decision.kind !== "ROUTE") return false;
  return resolution.contexts.some(
    (context) => context.status === "AVAILABLE" && context.targetRoute === decision.targetRoute,
  );
}

function workspaceForDecision(decision: PostSignInAccessDecision): BusinessWorkspace | null {
  if (decision.kind === "INTERNAL" && isPathWithin(decision.targetRoute, "/admin")) return "ADMIN";
  if (decision.kind !== "PARTNER_OR_AGENT_WORKSPACE") return null;
  if (isPathWithin(decision.targetRoute, "/cabinet")) return "PARTNER";
  if (isPathWithin(decision.targetRoute, "/agent")) return "AGENT";
  return null;
}

function isPathWithin(path: string, root: string) {
  return path === root || path.startsWith(`${root}/`);
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
