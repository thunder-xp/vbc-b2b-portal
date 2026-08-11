import { notFound, redirect } from "next/navigation";

import { createCompanyUserManagementService } from "@/src/modules/access-control/actions/service-factory";
import { getPartnerRoleLabel } from "@/src/modules/platform-ui";
import { InvitationRegisterForm } from "@/src/modules/auth/components/InvitationRegisterForm";

export default async function InvitationRegistrationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await createCompanyUserManagementService().getInvitationPreview(token);
  if (!invitation || invitation.status !== "pending") notFound();
  if (invitation.accountExists) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(`/auth/invitations/${encodeURIComponent(token)}`)}`);
  }
  return <main className="grid min-h-screen place-items-center bg-zinc-50 px-4 py-10"><section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"><p className="text-sm font-semibold uppercase text-emerald-700">Novotech Partner Platform</p><h1 className="mt-2 text-2xl font-semibold text-zinc-950">Создать аккаунт</h1><p className="mt-3 text-sm leading-6 text-zinc-600">Компания <strong>{invitation.companyName}</strong> приглашает вас с ролью «{getPartnerRoleLabel(invitation.roleCode)}».</p><InvitationRegisterForm email={invitation.invitedEmail} fullName={invitation.invitedFullName} token={token} /></section></main>;
}
