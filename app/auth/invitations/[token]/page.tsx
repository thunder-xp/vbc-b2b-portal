import Link from "next/link";

import { acceptCompanyInvitationAction } from "@/src/modules/access-control/actions/company-users.actions";
import { createCompanyUserManagementService, getAuthenticatedUser } from "@/src/modules/access-control/actions/service-factory";
import { getPartnerRoleLabel } from "@/src/modules/platform-ui";

export default async function InvitationAcceptancePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ registered?: string; error?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const invitation = await createCompanyUserManagementService().getInvitationPreview(token);
  if (!invitation || invitation.status !== "pending") return <UnavailableInvitation />;
  const invitationPath = `/auth/invitations/${encodeURIComponent(token)}`;
  let authenticatedEmail: string | null = null;
  try { authenticatedEmail = (await getAuthenticatedUser()).email.toLowerCase(); } catch { authenticatedEmail = null; }
  const emailMatches = authenticatedEmail === invitation.invitedEmail;

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50 px-4 py-10">
      <section className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase text-emerald-700">Novotech Partner Platform</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">Вас пригласили в {invitation.companyName}</h1>
        <dl className="mt-5 grid gap-3 rounded-md bg-zinc-50 p-4 text-sm">
          <div><dt className="text-zinc-500">Компания</dt><dd className="font-medium text-zinc-950">{invitation.companyName}</dd></div>
          <div><dt className="text-zinc-500">Роль</dt><dd className="font-medium text-zinc-950">{getPartnerRoleLabel(invitation.roleCode)}</dd></div>
        </dl>
        {query.registered === "1" ? <p className="mt-5 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Проверьте почту и подтвердите email. После подтверждения вы вернётесь к приглашению автоматически.</p> : null}
        {query.error ? <p className="mt-5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">Не удалось завершить приглашение. Откройте исходную ссылку и повторите попытку.</p> : null}
        {authenticatedEmail && !emailMatches ? (
          <p className="mt-5 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Вы вошли с другим email. Выйдите и войдите как {invitation.invitedEmail}.</p>
        ) : authenticatedEmail ? (
          <form action={acceptCompanyInvitationAction.bind(null, token)} className="mt-6"><button className="h-11 w-full rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white">Принять приглашение</button></form>
        ) : invitation.accountExists ? (
          <Link className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white" href={`/auth/sign-in?next=${encodeURIComponent(invitationPath)}`}>Войти и принять приглашение</Link>
        ) : (
          <Link className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white" href={`${invitationPath}/register`}>Создать аккаунт</Link>
        )}
        <p className="mt-5 text-xs text-zinc-500">Ссылка одноразовая, действует до {new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" }).format(new Date(invitation.expiresAt))} и может быть отозвана.</p>
      </section>
    </main>
  );
}

function UnavailableInvitation() {
  return <main className="grid min-h-screen place-items-center bg-zinc-50 px-4"><section className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-6"><h1 className="text-xl font-semibold">Приглашение недоступно</h1><p className="mt-3 text-sm text-zinc-600">Ссылка истекла, уже использована или была отозвана. Запросите новое приглашение у владельца компании.</p><Link className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700" href="/">На главную</Link></section></main>;
}
