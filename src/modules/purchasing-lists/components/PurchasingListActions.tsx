"use client";

import { Archive, Copy, MoreHorizontal, Pencil, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import {
  duplicatePurchasingListAction,
  setPurchasingListArchivedAction,
} from "../actions";
import { getSavedKitCopy, procurementCopy, usePartnerLocale } from "../../partner-locale";

import { purchasingListEditorCopy } from "../../partner-locale/purchasing-list-editor-copy";
import { listIconButton } from "./purchasing-list-presentation";

export function PurchasingListActions({
  listId,
  revision,
  archived,
  canManage,
  isSystemFavorites = false,
  onEdit,
  disabled = false,
}: {
  listId: string;
  revision: number;
  archived: boolean;
  canManage: boolean;
  isSystemFavorites?: boolean;
  onEdit: () => void;
  disabled?: boolean;
}) {
  const router = useRouter();
  const locale = usePartnerLocale();
  const copy = procurementCopy(locale);
  const kitCopy = getSavedKitCopy(locale);
  const editorCopy = purchasingListEditorCopy(locale);
  const menu = useRef<HTMLDetailsElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const run = (
    operation: () => Promise<{
      success: boolean;
      message: string;
      data: unknown;
    }>,
    destination?: (data: unknown) => string,
    onSuccess?: () => void,
  ) =>
    startTransition(async () => {
      const result = await operation();
      setMessage(result.success ? copy.operationComplete : copy.operationError);
      if (result.success) onSuccess?.();
      if (result.success && destination) router.push(destination(result.data));
      else router.refresh();
    });
  if (!canManage) return null;
  const menuButton = "flex min-h-11 w-full items-center gap-2 rounded px-3 py-2 text-left text-sm font-medium hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-40";
  return <div className="col-span-2 justify-self-end sm:justify-self-auto">
    <details className="relative" ref={menu} onKeyDown={(event) => { if (event.key === "Escape" && menu.current) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } }}>
      <summary aria-label={editorCopy.management} className={`${listIconButton} cursor-pointer list-none border border-zinc-300 bg-white [&::-webkit-details-marker]:hidden`} title={editorCopy.management}><MoreHorizontal aria-hidden="true" className="size-4" /></summary>
      <div className="absolute right-0 top-full z-20 mt-1 w-60 max-w-[calc(100vw-32px)] rounded-md border border-zinc-200 bg-white p-1 shadow-lg">
        {!archived && !isSystemFavorites ? <button className={menuButton} disabled={pending || disabled} onClick={() => { if (menu.current) menu.current.open = false; onEdit(); }} type="button"><Pencil aria-hidden="true" className="size-4 shrink-0" />{kitCopy.rename}</button> : null}
        <button className={menuButton} disabled={pending || disabled} onClick={() => run(() => duplicatePurchasingListAction(listId), (data) => `/cabinet/purchasing-lists/${(data as { id: string }).id}`)} type="button"><Copy aria-hidden="true" className="size-4 shrink-0" />{kitCopy.saveAsNew}</button>
        {!isSystemFavorites ? <button className={`${menuButton} text-rose-700`} disabled={pending || disabled} onClick={() => run(() => setPurchasingListArchivedAction(listId, revision, !archived))} type="button">{archived ? <RotateCcw aria-hidden="true" className="size-4 shrink-0" /> : <Archive aria-hidden="true" className="size-4 shrink-0" />}{archived ? copy.restore : kitCopy.archive}</button> : null}
      </div>
    </details>
    {message ? <p className="mt-1 text-xs text-zinc-600" role="status">{message}</p> : null}
  </div>;
}
