import type { ReactNode } from "react";

import { redirect } from "next/navigation";

import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions";
import {
  PartnerLayout,
  WorkspaceAccessState,
} from "@/src/modules/partner-cabinet/components";

export default async function CabinetLayout({ children }: { children: ReactNode }) {
  const result = await getPartnerWorkspaceContextAction();

  if (!result.success) {
    if (result.errorCode === "AUTH_REQUIRED") redirect("/auth/sign-in");
    return <WorkspaceAccessState state="unavailable" />;
  }

  const context = result.data;
  if (context.accessState === "internal") redirect("/admin/partner-requests");
  if (context.accessState === "missing_profile") redirect("/onboarding/profile");
  if (context.accessState === "pending_approval" || context.accessState === "rejected") {
    redirect("/onboarding/waiting");
  }

  const shell = {
    userDisplayName: context.userDisplayName,
    userEmail: context.userEmail,
    companyName: context.companyName,
    membershipRole: context.membershipRole,
    accessState: context.accessState,
  };

  if (context.accessState === "suspended") {
    return <PartnerLayout context={shell}><WorkspaceAccessState state="suspended" /></PartnerLayout>;
  }
  if (context.accessState === "missing_membership") {
    return <PartnerLayout context={shell}><WorkspaceAccessState state="missing_membership" /></PartnerLayout>;
  }
  if (context.accessState === "missing_company") {
    return <PartnerLayout context={shell}><WorkspaceAccessState state="missing_company" /></PartnerLayout>;
  }

  return <PartnerLayout context={shell}>{children}</PartnerLayout>;
}
