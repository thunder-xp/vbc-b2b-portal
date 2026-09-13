"use client";

import Link from "next/link";
import { BookOpen, LayoutDashboard, QrCode, Send, UserRound, UsersRound } from "lucide-react";
import { usePathname } from "next/navigation";

const items = [
  ["/agent", "Обзор", LayoutDashboard], ["/agent/clients", "Мои клиенты", UsersRound],
  ["/agent/referrals", "Заявки", Send], ["/agent/qr", "Мой QR", QrCode],
  ["/agent/materials", "Материалы", BookOpen], ["/agent/profile", "Профиль", UserRound],
] as const;

export function AgentNavigation() {
  const pathname = usePathname();
  return <nav aria-label="Кабинет агента" className="overflow-x-auto border-b border-zinc-200 bg-white">
    <div className="mx-auto flex max-w-6xl gap-1 px-3">{items.map(([href, label, Icon]) => {
      const active = href === "/agent" ? pathname === href : pathname.startsWith(href);
      return <Link aria-current={active ? "page" : undefined} className={`flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium hover:border-emerald-700 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-emerald-700 ${active ? "border-emerald-700 text-zinc-950" : "border-transparent text-zinc-600"}`} href={href} key={href} prefetch={false}><Icon aria-hidden size={17}/>{label}</Link>;
    })}</div>
  </nav>;
}
