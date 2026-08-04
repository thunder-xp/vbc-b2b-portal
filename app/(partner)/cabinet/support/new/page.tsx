import { randomUUID } from "node:crypto";
import Link from "next/link";
import { SupportTicketForm } from "@/src/modules/partner-support";
export default function NewSupportTicketPage() { return <div className="mx-auto max-w-3xl space-y-6"><header><Link className="text-sm font-medium text-emerald-700" href="/cabinet/support">← К заявкам</Link><h1 className="mt-3 text-2xl font-semibold">Заявка в IT-поддержку</h1><p className="mt-2 text-sm text-zinc-600">Контактные данные и компания будут добавлены автоматически из вашего профиля.</p></header><SupportTicketForm idempotencyKey={randomUUID()} /></div>; }
