"use client";

import {
  ChevronDown,
  LogOut,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { signOutAction } from "@/src/modules/auth/actions/auth.actions";

import { findAdminNavigationItem } from "../navigation";
import type { AdminWorkspaceContext } from "../types";

const ENVIRONMENT_LABELS = {
  production: "Production",
  preview: "Preview",
  development: "Development",
} as const;

export function AdminShell({
  children,
  context,
}: {
  children: ReactNode;
  context: AdminWorkspaceContext;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeItem = useMemo(
    () => findAdminNavigationItem(context.navigation, pathname),
    [context.navigation, pathname],
  );

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  const navigation = (
    <nav aria-label="Административная навигация" className="space-y-2 px-3 py-4">
      {context.navigation.map((group) => {
        const activeGroup = group.items.some(
          (item) =>
            pathname === item.href ||
            (item.href !== "/admin" && pathname.startsWith(`${item.href}/`)),
        );

        return (
          <details className="group" key={group.label} open={activeGroup}>
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-md px-3 text-xs font-semibold uppercase text-zinc-500 hover:bg-zinc-100">
              {group.label}
              <ChevronDown
                aria-hidden
                className="h-4 w-4 transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="mt-1 space-y-1">
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/admin" &&
                    pathname.startsWith(`${item.href}/`));
                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-10 items-center rounded-md px-3 text-sm font-medium ${
                      active
                        ? "bg-emerald-50 text-emerald-800"
                        : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
                    }`}
                    href={item.href}
                    key={item.href}
                    onClick={() => setMobileOpen(false)}
                    prefetch={false}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </details>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      {mobileOpen ? (
        <button
          aria-label="Закрыть навигацию"
          className="fixed inset-0 z-40 bg-zinc-950/35 lg:hidden"
          data-testid="admin-navigation-overlay"
          onClick={() => setMobileOpen(false)}
          type="button"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-zinc-200 bg-white transition-transform lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-zinc-200 px-5">
          <Link
            className="flex items-center gap-3 font-semibold"
            href="/admin"
            prefetch={false}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-700 text-white">
              <ShieldCheck aria-hidden className="h-5 w-5" />
            </span>
            <span>Панель администратора</span>
          </Link>
          <button
            aria-label="Закрыть навигацию"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 lg:hidden"
            onClick={() => setMobileOpen(false)}
            type="button"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{navigation}</div>
        <div className="border-t border-zinc-200 p-4">
          <p className="truncate text-sm font-semibold">{context.displayName}</p>
          <p className="mt-1 truncate text-xs text-zinc-500">
            {context.roleCodes.join(", ")}
          </p>
          <form action={signOutAction} className="mt-3">
            <button
              className="flex h-10 w-full items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              type="submit"
            >
              <LogOut aria-hidden className="h-4 w-4" />
              Выйти
            </button>
          </form>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-4 border-b border-zinc-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <button
            aria-label="Открыть навигацию"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 lg:hidden"
            onClick={() => setMobileOpen(true)}
            type="button"
          >
            <Menu aria-hidden className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-zinc-500">
              Панель администратора
              {activeItem ? ` / ${activeItem.label}` : ""}
            </p>
            <p className="truncate text-sm font-semibold">
              {activeItem?.label ?? "Внутренняя рабочая область"}
            </p>
          </div>
          <span className="rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-600">
            {ENVIRONMENT_LABELS[context.environment]}
          </span>
        </header>
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
