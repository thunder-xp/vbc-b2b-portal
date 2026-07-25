"use client";

export default function InvitationAcceptanceError() {
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50 px-4">
      <section className="max-w-md rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-950">Приглашение недоступно</h1>
        <p className="mt-2 text-sm text-zinc-600">Ссылка истекла, была отозвана или не соответствует вашей учётной записи.</p>
      </section>
    </main>
  );
}
