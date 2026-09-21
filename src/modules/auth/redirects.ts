export function safeRelativeAuthRedirect(value: FormDataEntryValue | string | null): string | null {
  const path = String(value ?? "");
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 500) return null;
  try {
    const base = new URL("https://auth.nsd.invalid");
    const resolved = new URL(path, base);
    return resolved.origin === base.origin ? path : null;
  } catch {
    return null;
  }
}

export type BusinessWorkspace = "ADMIN" | "PARTNER" | "AGENT";

export type PostSignInContinuation =
  | Readonly<{ kind: "INTERNAL_INVITATION"; path: "/auth/internal-invitation" }>
  | Readonly<{ kind: "COMPANY_INVITATION"; path: string; token: string }>
  | Readonly<{ kind: "GOVERNED_ONBOARDING"; path: string }>
  | Readonly<{ kind: "WORKSPACE"; path: string; workspace: BusinessWorkspace }>
  | Readonly<{ kind: "GENERAL_NAVIGATION"; path: string }>
  | Readonly<{ kind: "DISCARD" }>;

const GOVERNED_ONBOARDING_PATHS = new Set([
  "/become-partner/agent",
  "/onboarding",
  "/onboarding/access-request",
  "/onboarding/profile",
  "/onboarding/waiting",
]);

export function classifyPostSignInContinuation(path: string | null): PostSignInContinuation | null {
  if (!path) return null;
  const pathname = new URL(path, "https://auth.nsd.invalid").pathname;

  if (pathname === "/auth/business-access-state") return { kind: "DISCARD" };
  if (pathname === "/auth/internal-invitation") {
    return { kind: "INTERNAL_INVITATION", path: "/auth/internal-invitation" };
  }

  const invitation = /^\/auth\/invitations\/([A-Za-z0-9_-]{20,256})$/.exec(pathname);
  if (invitation) return { kind: "COMPANY_INVITATION", path, token: invitation[1] };
  if (GOVERNED_ONBOARDING_PATHS.has(pathname)) return { kind: "GOVERNED_ONBOARDING", path };

  const workspace = workspaceForPath(pathname);
  if (workspace) return { kind: "WORKSPACE", path, workspace };

  // Unknown auth routes are never sticky after authentication. This prevents
  // stale sign-in and access-state URLs from creating redirect loops.
  if (pathname === "/auth" || pathname.startsWith("/auth/")) return { kind: "DISCARD" };
  return { kind: "GENERAL_NAVIGATION", path };
}

function workspaceForPath(pathname: string): BusinessWorkspace | null {
  if (isPathWithin(pathname, "/admin")) return "ADMIN";
  if (isPathWithin(pathname, "/cabinet")) return "PARTNER";
  if (isPathWithin(pathname, "/agent")) return "AGENT";
  return null;
}

function isPathWithin(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(`${root}/`);
}

export type ProfessionalRegistrationIntent = "agent" | "installer";

export function professionalRegistrationContinuation(
  intent: ProfessionalRegistrationIntent,
  locale: "ru" | "ro",
): string {
  return intent === "agent"
    ? `/become-partner/agent?lang=${locale}`
    : `/onboarding/profile?lang=${locale}`;
}
