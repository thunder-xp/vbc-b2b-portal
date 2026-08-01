import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50 px-6">
      <section className="max-w-lg border-l-4 border-amber-500 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase text-amber-700">Доступ ограничен</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">Недостаточно прав</h1>
        <p className="mt-3 text-sm text-zinc-600">
          У вашей учётной записи нет разрешения для просмотра этого раздела.
        </p>
        <Link className="mt-5 inline-flex min-h-11 items-center font-semibold text-emerald-700" href="/admin">
          Вернуться в административный раздел
        </Link>
      </section>
    </main>
  );
}
