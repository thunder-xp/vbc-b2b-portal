"use client";

import { Save, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { markAdminNomenclatureDuplicateAction, updateAdminNomenclatureAction, updateAdminNomenclatureCoverAction } from "../actions";
import type { AdminNomenclatureDetail, ExternalNomenclatureItemType, NomenclatureCurationStatus } from "../repositories";
import { NomenclatureCover } from "./NomenclatureCover";

const input = "min-h-11 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500";
export function AdminNomenclatureEditor({ item }: { item: AdminNomenclatureDetail }) {
  const router=useRouter(), fileRef=useRef<HTMLInputElement>(null); const [pending,start]=useTransition(); const [message,setMessage]=useState<string|null>(null);
  const complete=(operation:()=>Promise<{success:boolean;message:string}>)=>start(async()=>{const result=await operation();setMessage(result.message);if(result.success)router.refresh();});
  return <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
    <form className="grid min-w-0 gap-4 border-y border-zinc-200 bg-white py-5 sm:grid-cols-2" onSubmit={(event)=>{event.preventDefault();const data=new FormData(event.currentTarget);complete(()=>updateAdminNomenclatureAction({itemId:item.id,expectedVersion:item.version,itemType:String(data.get("itemType")) as ExternalNomenclatureItemType,manufacturer:value(data,"manufacturer"),model:value(data,"model"),name:String(data.get("name")??""),category:value(data,"category"),unit:String(data.get("unit")??"pcs"),specification:value(data,"specification"),status:String(data.get("status")) as Exclude<NomenclatureCurationStatus,"duplicate">,reason:String(data.get("reason")??"")}));}}>
      <Field label="Тип"><select className={input} defaultValue={item.itemType} name="itemType"><option value="equipment">Оборудование</option><option value="material">Материал</option><option value="service">Работа / услуга</option></select></Field>
      <Field label="Статус"><select className={input} defaultValue={item.curationStatus === "duplicate" ? "review_required" : item.curationStatus} name="status"><option value="review_required">Требует проверки</option><option value="active">Каноническая</option><option value="archived">Архив</option></select></Field>
      <Field label="Производитель / бренд"><input className={input} defaultValue={item.manufacturer??""} maxLength={120} name="manufacturer" /></Field>
      <Field label="Модель / код"><input className={input} defaultValue={item.model??""} maxLength={160} name="model" /></Field>
      <Field label="Каноническое наименование"><input className={input} defaultValue={item.name} maxLength={300} name="name" required /></Field>
      <Field label="Категория"><input className={input} defaultValue={item.category??""} maxLength={160} name="category" /></Field>
      <Field label="Единица"><select className={input} defaultValue={item.unit} name="unit"><option value="pcs">шт.</option><option value="meter">метр</option><option value="set">комплект</option><option value="hour">час</option><option value="visit">выезд</option><option value="service">услуга</option></select></Field>
      <Field className="sm:col-span-2" label="Каноническое описание"><textarea className={`${input} min-h-28 py-2`} defaultValue={item.specification??""} maxLength={2000} name="specification" /></Field>
      <Field className="sm:col-span-2" label="Причина изменения"><textarea className={`${input} min-h-20 py-2`} minLength={10} name="reason" required /></Field>
      <div className="flex items-center justify-between gap-3 sm:col-span-2"><p aria-live="polite" className="text-sm text-zinc-600">{message}</p><button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={pending}><Save className="size-4" />Сохранить</button></div>
    </form>
    <aside className="space-y-5">
      {item.itemType!=="service"?<section className="border border-zinc-200 bg-white p-4"><h2 className="font-semibold">Каноническая обложка</h2><div className="mt-3 flex gap-3"><NomenclatureCover hasCover={item.hasCover} itemId={item.id} name={item.name} size="lg" /><div className="min-w-0"><input accept="image/jpeg,image/png,image/webp" className="max-w-full text-sm" ref={fileRef} type="file" /><p className="mt-2 text-xs text-zinc-500">JPG, PNG или WebP, до 2 МБ.</p></div></div><textarea aria-label="Причина изменения обложки" className={`${input} mt-3 min-h-20 py-2`} id="cover-reason" placeholder="Причина изменения" /><div className="mt-3 flex flex-wrap gap-2"><button className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-semibold" onClick={()=>cover("upload")} type="button"><Upload className="size-4" />{item.hasCover?"Заменить":"Загрузить"}</button>{item.hasCover?<button className="min-h-11 text-sm font-semibold text-red-700" onClick={()=>cover("remove")} type="button">Удалить</button>:null}</div></section>:null}
      <section className="border border-zinc-200 bg-white p-4"><h2 className="font-semibold">Дубликат</h2><p className="mt-1 text-xs text-zinc-500">Будущие поиск и принятие используют каноническую позицию. Исторические строки смет не переписываются.</p><input aria-label="ID канонической позиции" className={`${input} mt-3`} id="canonical-id" placeholder="UUID канонической позиции" /><textarea aria-label="Причина объединения" className={`${input} mt-3 min-h-20 py-2`} id="duplicate-reason" placeholder="Причина (не менее 10 символов)" /><button className="mt-3 min-h-11 rounded-md border border-red-300 px-3 text-sm font-semibold text-red-700" onClick={()=>{const canonical=(document.getElementById("canonical-id") as HTMLInputElement).value;const reason=(document.getElementById("duplicate-reason") as HTMLTextAreaElement).value;complete(()=>markAdminNomenclatureDuplicateAction(item.id,canonical,reason));}} type="button">Перенаправить на каноническую</button></section>
    </aside>
  </div>;
  function cover(intent:"upload"|"remove") { const data=new FormData();data.set("intent",intent);data.set("reason",(document.getElementById("cover-reason") as HTMLTextAreaElement).value);if(intent==="upload"&&fileRef.current?.files?.[0])data.set("cover",fileRef.current.files[0]);complete(()=>updateAdminNomenclatureCoverAction(item.id,item.version,data)); }
}
function Field({children,className="",label}:{children:React.ReactNode;className?:string;label:string}){return <label className={`min-w-0 text-xs font-medium text-zinc-600 ${className}`}>{label}<span className="mt-1 block">{children}</span></label>}
function value(data:FormData,key:string){const result=String(data.get(key)??"").trim();return result||null;}
