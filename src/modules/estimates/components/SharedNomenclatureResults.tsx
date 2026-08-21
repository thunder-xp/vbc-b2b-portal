"use client";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adoptPartnerNomenclatureAction } from "../actions";
import type { ExternalNomenclatureDto } from "../services";
import { NomenclatureCover } from "./NomenclatureCover";
import { getEstimatesCopy, usePartnerLocale } from "../../partner-locale";

export function SharedNomenclatureResults({records}:{records:ExternalNomenclatureDto[]}){
  const copy=getEstimatesCopy(usePartnerLocale());
  const router=useRouter();const[pending,start]=useTransition();const[message,setMessage]=useState<string|null>(null);
  return <section className="space-y-3"><div><h2 className="text-lg font-semibold">{copy.sharedLibrary}</h2><p className="text-sm text-zinc-500">{copy.sharedLibrarySafeHint}</p></div>{message?<p aria-live="polite" className="border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm">{message}</p>:null}<div className="divide-y divide-zinc-200 border-y border-zinc-200">{records.map(item=><article className="flex min-w-0 items-center gap-3 py-3" key={item.id}><NomenclatureCover hasCover={item.hasCover} itemId={item.id} name={item.name}/><div className="min-w-0 flex-1"><strong className="block break-words">{item.name}</strong><p className="text-xs text-zinc-500">{[item.manufacturer,item.model,item.category,item.unit].filter(Boolean).join(" · ")}</p></div><button className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-semibold disabled:opacity-50" disabled={pending} onClick={()=>start(async()=>{const result=await adoptPartnerNomenclatureAction(item.id);setMessage(result.success ? copy.operationSucceeded : copy.operationFailed);if(result.success)router.refresh();})} type="button"><Plus className="size-4"/>{copy.add}</button></article>)}{!records.length?<p className="py-8 text-center text-sm text-zinc-500">{copy.canonicalNotFound}</p>:null}</div></section>;
}
