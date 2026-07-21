"use client";

import { ListPlus } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

const PurchasingListChooserDialog = dynamic(
  () => import("./PurchasingListChooserDialog").then((module) => module.PurchasingListChooserDialog),
  { ssr: false },
);

export function AddToPurchasingListButton({ compact = false, productId }: { compact?: boolean; productId: string }) {
  const [open, setOpen] = useState(false);
  const label = "Добавить в другой список";
  return <>
    <button aria-label={compact ? label : undefined} className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white text-sm font-semibold text-zinc-800 ${compact ? "size-9 p-0" : "px-3"}`} onClick={() => setOpen(true)} title={compact ? label : undefined} type="button"><ListPlus className="size-4" />{compact ? null : label}</button>
    {open ? <PurchasingListChooserDialog onClose={() => setOpen(false)} productId={productId} /> : null}
  </>;
}
