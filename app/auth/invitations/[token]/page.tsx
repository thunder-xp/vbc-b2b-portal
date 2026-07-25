import Link from "next/link";

import {
  acceptCompanyInvitationAction,
} from "@/src/modules/access-control/actions";
import { getAuthenticatedUser } from "@/src/modules/access-control/actions/service-factory";

export default async function InvitationAcceptancePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitationPath = `/auth/invitations/${encodeURIComponent(token)}`;
  let authenticated = false;
  try {
    await getAuthenticatedUser();
    authenticated = true;
  } catch {
    authenticated = false;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50 px-4 py-10">
      <section className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase text-emerald-700">Novotech Systems</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">Приглашение в компанию</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Войдите или создайте учётную запись с тем адресом электронной почты, на который отправлено приглашение.
        </p>
        {authenticated ? (
          <form action={acceptCompanyInvitationAction.bind(null, token)} className="mt-6">
            <button className="h-11 w-full rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white">
              Принять приглашение
            </button>
          </form>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link className="inline-flex h-11 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white" href={`/auth/sign-in?next=${encodeURIComponent(invitationPath)}`}>
              Войти
            </Link>
            <Link className="inline-flex h-11 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800" href={`/auth/register?next=${encodeURIComponent(invitationPath)}`}>
              Создать аккаунт
            </Link>
          </div>
        )}
        <p className="mt-5 text-xs text-zinc-500">Ссылка одноразовая и может быть отозвана владельцем компании.</p>
      </section>
    </main>
  );
}
