import Link from "next/link";
import { CustomerServiceRequestForm } from "@/src/modules/final-customer/components";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";

export default async function NewCustomerServiceRequestPage() {
  const locale = await getFinalCustomerLocale(); const ro = locale === "ro";
  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:py-8"><header><Link className="text-sm font-semibold text-emerald-700" href="/account/service">← {ro ? "Service" : "Сервис"}</Link><h1 className="mt-3 text-2xl font-semibold">{ro ? "Solicitare nouă" : "Новое обращение"}</h1><p className="mt-1 text-sm text-zinc-600">{ro ? "Descrieți pe scurt situația. Nu trimitem automat SMS sau email." : "Кратко опишите ситуацию. Автоматическая отправка SMS или email не выполняется."}</p></header><CustomerServiceRequestForm locale={locale} /></main>;
}
