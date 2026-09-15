"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { FileText, X } from "lucide-react";

export function ServiceAttachmentPicker({ name = "files", locale }: { name?: string; locale: "ru" | "ro" }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Array<{ file: File; preview: string }>>([]);
  const ro = locale === "ro";
  function update(next: Array<{ file: File; preview: string }>) {
    setItems(next);
    const transfer = new DataTransfer(); next.forEach(({ file }) => transfer.items.add(file));
    if (inputRef.current) inputRef.current.files = transfer.files;
  }
  return <div className="space-y-2">
    <label className="block text-sm font-medium">{ro ? "Fotografii sau PDF" : "Фотографии или PDF"}
      <input ref={inputRef} accept="image/jpeg,image/png,image/webp,application/pdf" className="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 bg-white p-2 text-sm" multiple name={name} onChange={(event) => update(Array.from(event.target.files ?? []).slice(0, 5).map((file) => ({ file, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : "" })))} type="file" />
    </label>
    <p className="text-xs text-zinc-500">{ro ? "Maximum 5 fișiere, câte 10 MB. JPG, PNG, WEBP sau PDF." : "До 5 файлов по 10 МБ. JPG, PNG, WEBP или PDF."}</p>
    {items.length ? <ul className="grid gap-2 sm:grid-cols-2">{items.map(({ file, preview }, index) => <li className="flex min-w-0 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2" key={`${file.name}-${file.lastModified}`}>
      {preview ? <Image alt="" className="size-12 rounded object-cover" height={48} src={preview} unoptimized width={48} /> : <FileText aria-hidden className="size-5 shrink-0 text-zinc-500" />}
      <span className="min-w-0 flex-1 truncate text-xs">{file.name}</span>
      <button aria-label={ro ? `Elimină ${file.name}` : `Удалить ${file.name}`} className="grid min-h-11 min-w-11 place-items-center rounded-lg hover:bg-zinc-200" onClick={() => { if (preview) URL.revokeObjectURL(preview); update(items.filter((_, itemIndex) => itemIndex !== index)); }} type="button"><X aria-hidden className="size-4" /></button>
    </li>)}</ul> : null}
  </div>;
}
