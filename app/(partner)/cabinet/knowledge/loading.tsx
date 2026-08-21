"use client";

import { secondaryCopy, usePartnerLocale } from "@/src/modules/partner-locale";

export default function KnowledgeLoading() {
  const copy = secondaryCopy(usePartnerLocale());
  return (
    <div aria-busy="true" aria-label={copy.knowledgeLoading} className="space-y-6">
      <header>
        <div className="h-4 w-36 animate-pulse bg-zinc-200" />
        <div className="mt-3 h-8 w-52 animate-pulse bg-zinc-200" />
        <div className="mt-3 h-5 max-w-xl animate-pulse bg-zinc-100" />
      </header>
      <div className="h-11 w-full animate-pulse bg-zinc-100" />
      <section className="space-y-3">
        <div className="h-6 w-56 animate-pulse bg-zinc-200" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              className="min-h-32 animate-pulse border border-zinc-200 bg-white p-5"
              key={index}
            >
              <div className="h-3 w-20 bg-zinc-100" />
              <div className="mt-3 h-5 w-3/4 bg-zinc-200" />
              <div className="mt-3 h-4 w-full bg-zinc-100" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
