"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type PartnerSidebarProps = {
  hasActiveCompany?: boolean;
  onNavigate?: () => void;
};

type NavItem =
  | {
      href: string;
      label: string;
      disabled?: false;
    }
  | {
      label: string;
      disabled: true;
    };

const navItems: NavItem[] = [
  { href: "/cabinet", label: "Partner Dashboard" },
  { href: "/cabinet/profile", label: "Profile" },
  { href: "/cabinet/company", label: "Company" },
  { href: "/cabinet/memberships", label: "Memberships" },
];

export function PartnerSidebar({ hasActiveCompany = true, onNavigate }: PartnerSidebarProps) {
  const pathname = usePathname();
  const visibleItems = hasActiveCompany
    ? [
        ...navItems,
        { href: "/cabinet/notifications", label: "Notifications" },
        { href: "/cabinet/catalog", label: "Catalog" },
      ]
    : navItems;

  return (
    <aside className="flex h-full flex-col border-r border-zinc-200 bg-zinc-950 text-white">
      <div className="border-b border-white/10 px-5 py-5">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">
          Novotech
        </p>
        <p className="mt-2 text-lg font-semibold">Partner Cabinet</p>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {visibleItems.map((item) => {
          if (item.disabled) {
            return (
              <span
                className="block rounded-md px-3 py-2 text-sm text-zinc-500"
                key={item.label}
              >
                {item.label}
              </span>
            );
          }

          const isActive = pathname === item.href;

          return (
            <Link
              className={`block rounded-md px-3 py-2 text-sm font-medium ${
                isActive
                  ? "bg-emerald-600 text-white"
                  : "text-zinc-300 hover:bg-white/10 hover:text-white"
              }`}
              href={item.href}
              key={item.href}
              onClick={onNavigate}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
