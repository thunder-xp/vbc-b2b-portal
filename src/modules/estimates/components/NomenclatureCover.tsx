/* eslint-disable @next/next/no-img-element -- the private proxy requires the browser's authenticated cookie */
import { ImageIcon } from "lucide-react";

export function NomenclatureCover({ hasCover, itemId, name, size = "md" }: {
  hasCover: boolean;
  itemId: string;
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const dimensions = size === "sm" ? "size-12" : size === "lg" ? "size-24" : "size-16";
  return <span className={`${dimensions} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-zinc-50`}>
    {hasCover
      ? <img alt={name} className="size-full max-h-full max-w-full object-contain" height={size === "lg" ? 96 : size === "sm" ? 48 : 64} loading="lazy" src={`/api/nomenclature/covers/${itemId}`} width={size === "lg" ? 96 : size === "sm" ? 48 : 64} />
      : <ImageIcon aria-label="Нет изображения" className="size-5 text-zinc-400" />}
  </span>;
}
