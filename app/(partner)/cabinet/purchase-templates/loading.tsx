"use client";

import { procurementCopy, usePartnerLocale } from "@/src/modules/partner-locale";

export default function PurchaseTemplatesLoading() { return <div aria-label={procurementCopy(usePartnerLocale()).templatesLoading} className="space-y-4" role="status"><div className="h-20 animate-pulse bg-zinc-100" /><div className="h-40 animate-pulse bg-zinc-100" /><div className="h-40 animate-pulse bg-zinc-100" /></div>; }
