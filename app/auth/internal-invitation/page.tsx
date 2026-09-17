import { InternalInvitationActivationForm } from "@/src/modules/auth/components";

export default function InternalInvitationPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase text-emerald-700">Novotech Platform</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">Активация внутреннего доступа</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Установите пароль. Роль финансового оператора будет активирована только для подтверждённой приглашённой учётной записи.
        </p>
        <InternalInvitationActivationForm />
      </section>
    </main>
  );
}
