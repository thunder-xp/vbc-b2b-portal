"use client";

import { usePartnerText } from "@/src/modules/partner-locale";

export default function CabinetLoading() {
  const text = usePartnerText();
  return (
    <div aria-label={text("common.loading")} className="space-y-5" role="status">
      <div className="h-7 w-56 animate-pulse rounded bg-zinc-200" />
      <div className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div className="h-28 animate-pulse rounded-md border border-zinc-200 bg-zinc-50" key={item} />
        ))}
      </div>
      <span className="sr-only">{text("common.loading")}</span>
    </div>
  );
}
