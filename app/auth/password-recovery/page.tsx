import Link from "next/link";
import { PasswordRecoveryForm } from "@/src/modules/auth/components/PasswordRecoveryForm";

export default async function PasswordRecoveryPage({ searchParams }: { searchParams: Promise<{ recovery_error?: string }> }) {
  const { recovery_error: error } = await searchParams;
  return <main className="mx-auto flex min-h-[70vh] w-full max-w-md items-center px-4 py-10"><section className="w-full rounded-lg border border-zinc-200 bg-white p-6"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Безопасность</p><h1 className="mt-2 text-2xl font-semibold">Новый пароль</h1><p className="mt-2 text-sm text-zinc-600">Установите новый пароль для своей учётной записи. Администратор не видит и не задаёт пароль.</p>{error ? <p className="mt-4 text-sm text-red-700" role="alert">Ссылка недействительна или истекла. Запросите новую ссылку у администратора.</p> : <PasswordRecoveryForm/>}<Link className="mt-5 flex min-h-11 items-center justify-center border border-zinc-300 px-4 text-sm font-semibold" href="/auth/sign-in">Вернуться ко входу</Link></section></main>;
}
