"use client";

import { LogOut, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { signOutAction } from "@/src/modules/auth/actions/auth.actions";

import type { AdminWorkspaceContext } from "../types";

export function AdminUserMenu({
  context,
}: {
  context: Pick<AdminWorkspaceContext, "displayName" | "roleCodes">;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        aria-controls="admin-user-menu"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Профиль пользователя"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        data-header-control="admin-user-menu"
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        type="button"
      >
        <UserRound aria-hidden className="size-5" />
      </button>

      {open ? (
        <div
          aria-label="Меню пользователя"
          className="fixed inset-x-3 top-[4.5rem] z-50 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+0.5rem)] sm:w-72 sm:max-w-[calc(100vw-1.5rem)]"
          id="admin-user-menu"
          role="menu"
        >
          <div className="border-b border-zinc-200 px-4 py-3">
            <p className="truncate text-sm font-semibold text-zinc-950">
              {context.displayName}
            </p>
            <p className="mt-1 truncate text-xs text-zinc-500">
              {context.roleCodes.join(", ")}
            </p>
          </div>
          <form action={signOutAction} className="p-1.5">
            <button
              className="flex min-h-11 w-full items-center gap-3 rounded px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              role="menuitem"
              type="submit"
            >
              <LogOut aria-hidden className="size-4" />
              Выйти
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
