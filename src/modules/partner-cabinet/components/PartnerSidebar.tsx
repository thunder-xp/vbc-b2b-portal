"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/cabinet", label: "Рабочее пространство", available: true },
  { href: "/cabinet/catalog", label: "Каталог", available: true },
  { href: null, label: "Заказы", available: false },
  { href: null, label: "Проекты", available: false },
  { href: null, label: "Документы", available: false },
  { href: null, label: "Финансы", available: false },
  { href: "/cabinet/company", label: "Моя компания", available: true },
  { href: "/cabinet/profile", label: "Настройки профиля", available: true },
] as const;

export function PartnerSidebar({ hasWorkspaceAccess = true, onNavigate }: { hasWorkspaceAccess?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <aside className="flex h-full flex-col border-r border-zinc-200 bg-zinc-950 text-white">
      <div className="border-b border-white/10 px-5 py-5">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">Novotech</p>
        <p className="mt-2 text-lg font-semibold">Partner Workspace</p>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const enabled = item.available && (hasWorkspaceAccess || item.href === "/cabinet");
          if (!enabled || !item.href) {
            return <span className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-zinc-500" key={item.label}><span>{item.label}</span><span className="text-xs">Скоро</span></span>;
          }
          const active = pathname === item.href;
          return <Link className={`block rounded-md px-3 py-2 text-sm font-medium ${active ? "bg-emerald-600 text-white" : "text-zinc-300 hover:bg-white/10 hover:text-white"}`} href={item.href} key={item.href} onClick={onNavigate}>{item.label}</Link>;
        })}
      </nav>
    </aside>
  );
}
