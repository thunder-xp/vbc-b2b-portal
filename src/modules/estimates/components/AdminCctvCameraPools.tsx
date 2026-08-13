"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, Plus, Save, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ProductThumbnail } from "../../catalog/components/ProductThumbnail";
import {
  CCTV_OBJECT_TYPES, getCctvConfigurationDiagnostics, selectCctvCameraCandidates, selectEconomyAlternative,
  type CctvCameraCandidateSearchRow, type CctvCameraPlacement, type CctvCameraPoolAdminRow,
  type CctvObjectConfiguration, type CctvObjectServiceBinding,
} from "../../cctv-calculation";
import { actionClassName, ActionFeedback } from "../../platform-ui";
import {
  removeCctvCameraPoolAction, searchCctvCameraCandidatesAction, upsertCctvCameraPoolAction,
  upsertCctvObjectServiceBindingAction,
} from "../actions";

const objectLabels: Record<string,string> = { apartment:"Квартира",house:"Частный дом",office:"Офис",retail:"Магазин / Retail",warehouse:"Склад",industrial:"Производство",horeca:"HoReCa",other:"Общий пул" };
const priorityLabels = { high:"Высокий",normal:"Обычный",low:"Низкий" } as const;
const familyLabels: Record<string,string> = { cable_routing:"Прокладка кабеля",equipment_installation:"Монтаж оборудования",commissioning:"Пусконаладка",remote_viewing_configuration:"Удалённый просмотр",ai_scenario_programming:"AI-сценарии" };
type WorkspaceTab = "cameras" | "services" | "summary";

export function AdminCctvCameraPools({ initialRows, initialConfigurations }: {
  initialRows: CctvCameraPoolAdminRow[];
  initialConfigurations: CctvObjectConfiguration[];
}) {
  const [rows,setRows]=useState(initialRows);
  const [configurations,setConfigurations]=useState(initialConfigurations);
  const [objectType,setObjectType]=useState<(typeof CCTV_OBJECT_TYPES)[number]>("warehouse");
  const [tab,setTab]=useState<WorkspaceTab>("cameras");
  const [placement,setPlacement]=useState<CctvCameraPlacement>("indoor");
  const configuration=configurations.find((item)=>item.objectType===objectType) ?? initialConfigurations[0];
  const preview=useMemo(()=>cameraPreview(rows,objectType),[rows,objectType]);
  const diagnostics=getCctvConfigurationDiagnostics({
    indoorCandidates: rows.filter((row)=>row.objectType===objectType&&row.placement==="indoor").length,
    outdoorCandidates: rows.filter((row)=>row.objectType===objectType&&row.placement==="outdoor").length,
    indoorEligible: preview.indoor.eligible.length,
    outdoorEligible: preview.outdoor.eligible.length,
    services: configuration?.services ?? [],
  });
  const saveCamera=(saved:CctvCameraPoolAdminRow)=>setRows((current)=>current.some((row)=>row.candidateId===saved.candidateId)
    ?current.map((row)=>row.candidateId===saved.candidateId?saved:row):[...current,saved]);
  const removeCamera=(candidateId:string)=>setRows((current)=>current.filter((row)=>row.candidateId!==candidateId));
  const saveService=(saved:CctvObjectServiceBinding)=>setConfigurations((current)=>current.map((item)=>item.objectType!==objectType?item:{...item,services:item.services.map((service)=>service.serviceCode===saved.serviceCode?saved:service)}));
  return <section className="overflow-hidden rounded-md border border-zinc-200 bg-white">
    <header className="border-b border-zinc-200 px-4 py-4"><h2 className="font-semibold">Конфигурация CCTV по типу объекта</h2><p className="mt-1 text-sm text-zinc-600">Камеры, применимые услуги и диагностика в одном рабочем пространстве. Цены услуг берутся из общего опубликованного тарифа.</p></header>
    <div className="grid min-w-0 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label="Тип объекта" className="border-b border-zinc-200 bg-zinc-50 p-2 lg:border-r lg:border-b-0">
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:block">{CCTV_OBJECT_TYPES.map((value)=><button aria-current={objectType===value?"page":undefined} className={`min-h-11 w-full rounded px-3 py-2 text-left text-sm ${objectType===value?"bg-emerald-700 font-medium text-white":"hover:bg-zinc-100"}`} key={value} onClick={()=>setObjectType(value)} type="button">{objectLabels[value]}</button>)}</div>
      </nav>
      <div className="min-w-0">
        <div aria-label="Раздел настройки" className="grid grid-cols-3 border-b border-zinc-200" role="tablist">{(["cameras","services","summary"] as WorkspaceTab[]).map((value)=><button aria-selected={tab===value} className={`min-h-11 border-b-2 px-3 text-sm font-medium ${tab===value?"border-emerald-700 text-emerald-800":"border-transparent text-zinc-600"}`} key={value} onClick={()=>setTab(value)} role="tab" type="button">{value==="cameras"?"Камеры":value==="services"?"Услуги":"Сводка"}</button>)}</div>
        <div className="p-4">
          {tab==="cameras"&&<CamerasWorkspace objectType={objectType} placement={placement} preview={preview} rows={rows} setPlacement={setPlacement} onRemoved={removeCamera} onSaved={saveCamera}/>}
          {tab==="services"&&configuration&&<ServicesWorkspace configuration={configuration} onSaved={saveService}/>}
          {tab==="summary"&&configuration&&<SummaryWorkspace configuration={configuration} diagnostics={diagnostics} objectType={objectType} preview={preview}/>}
        </div>
      </div>
    </div>
  </section>;
}

function CamerasWorkspace({objectType,placement,preview,rows,setPlacement,onSaved,onRemoved}:{objectType:(typeof CCTV_OBJECT_TYPES)[number];placement:CctvCameraPlacement;preview:ReturnType<typeof cameraPreview>;rows:CctvCameraPoolAdminRow[];setPlacement:(value:CctvCameraPlacement)=>void;onSaved:(row:CctvCameraPoolAdminRow)=>void;onRemoved:(id:string)=>void}) {
  const visible=rows.filter((row)=>row.objectType===objectType&&row.placement===placement);
  const selection=placement==="indoor"?preview.indoor:preview.outdoor;
  return <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="font-semibold">Кандидаты камер · {objectLabels[objectType]}</h3><p className="mt-1 text-sm text-zinc-600">Техническая совместимость проверяется общей политикой до коммерческого ранжирования.</p></div><div className="grid min-w-64 grid-cols-2"><button aria-pressed={placement==="indoor"} className={`min-h-11 border px-3 text-sm ${placement==="indoor"?"border-emerald-700 bg-emerald-50":"border-zinc-300"}`} onClick={()=>setPlacement("indoor")} type="button">В помещении</button><button aria-pressed={placement==="outdoor"} className={`min-h-11 border px-3 text-sm ${placement==="outdoor"?"border-emerald-700 bg-emerald-50":"border-zinc-300"}`} onClick={()=>setPlacement("outdoor")} type="button">На улице</button></div></div>
    <CameraPreview selection={selection}/>
    <CandidateSearch objectType={objectType} placement={placement} onSaved={onSaved}/>
    {visible.length?<div className="overflow-x-auto"><table className="min-w-[900px] w-full text-left text-sm"><thead className="border-y border-zinc-200 bg-zinc-50 text-xs text-zinc-600"><tr><th className="p-2">Кандидат</th><th className="p-2">Характеристики</th><th className="p-2">Сигналы</th><th className="p-2">Приоритет</th><th className="p-2">Состояние</th><th className="p-2 text-right">Действия</th></tr></thead><tbody>{visible.map((row)=><CandidateEditor key={row.candidateId} row={row} onRemoved={onRemoved} onSaved={onSaved}/>)}</tbody></table></div>:<p className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm">Для этого объекта и размещения нет собственного пула. Общий пул используется только как явный fallback.</p>}
  </div>;
}

function CameraPreview({selection}:{selection:ReturnType<typeof cameraPreview>["indoor"]}) {
  const recommended=selection.recommended;
  const prices=new Map(selection.eligible.flatMap((row)=>row.retailPriceAmount==null?[]:[[row.productId,row.retailPriceAmount] as const]));
  const economy=selectEconomyAlternative(selection.eligible,prices,recommended?.productId??null);
  return <div className="grid gap-3 rounded-md border border-emerald-200 bg-emerald-50/50 p-3 sm:grid-cols-2"><PreviewValue label="Рекомендуемая" row={recommended}/><PreviewValue label="Эконом-вариант" row={economy}/><p className="text-xs text-emerald-900 sm:col-span-2">Выбор рассчитан общей политикой: техническая пригодность → ручной приоритет → запас и 90-дневный сигнал продаж.</p></div>;
}
function PreviewValue({label,row}:{label:string;row:(CctvCameraPoolAdminRow&{score:number})|null}) { return <div><p className="text-xs font-medium uppercase text-zinc-500">{label}</p><p className="mt-1 font-semibold">{row?`${row.sku} · ${row.name}`:"Нет доступного кандидата"}</p>{row&&<p className="mt-1 text-xs text-zinc-600">{row.resolutionMp} Мп · остаток {row.availableStock} · продажи 90 дней {row.recentSalesQty}</p>}</div>; }

function ServicesWorkspace({configuration,onSaved}:{configuration:CctvObjectConfiguration;onSaved:(row:CctvObjectServiceBinding)=>void}) {
  const groups=[...new Set(configuration.services.map((service)=>service.family))];
  return <div className="space-y-5"><header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="font-semibold">Услуги · {objectLabels[configuration.objectType]}</h3><p className="mt-1 text-sm text-zinc-600">Привязка определяет доступность для объекта. Цена не копируется и поступает из опубликованного общего тарифа.</p></div><p className="text-sm text-zinc-600">Тариф: {configuration.tariffSet?`v${configuration.tariffSet.version} · ${configuration.tariffSet.currency}`:"не опубликован"}</p></header>
    {groups.map((family)=><section key={family}><h4 className="mb-2 text-sm font-semibold">{familyLabels[family]}</h4><div className="overflow-x-auto"><table className="min-w-[780px] w-full text-left text-sm"><thead className="bg-zinc-50 text-xs text-zinc-600"><tr><th className="p-2">Услуга</th><th className="p-2">Единица</th><th className="p-2">Общий тариф</th><th className="p-2">Активна</th><th className="p-2">По умолчанию</th><th className="p-2 text-right">Действие</th></tr></thead><tbody>{configuration.services.filter((service)=>service.family===family).map((service)=><ServiceEditor key={service.bindingId} objectType={configuration.objectType} row={service} onSaved={onSaved}/>)}</tbody></table></div></section>)}
  </div>;
}

function ServiceEditor({objectType,row,onSaved}:{objectType:CctvObjectConfiguration["objectType"];row:CctvObjectServiceBinding;onSaved:(row:CctvObjectServiceBinding)=>void}) {
  const [enabled,setEnabled]=useState(row.enabled);const [suggested,setSuggested]=useState(row.calculatorDefault);const [message,setMessage]=useState<string|null>(null);const [pending,startTransition]=useTransition();
  return <tr className="border-t border-zinc-200"><td className="p-2"><strong>{row.label}</strong>{!row.partnerServiceId&&<span className="mt-1 block text-xs text-amber-700">B2B-позиция услуги не связана</span>}</td><td className="p-2">{unitLabel(row.unitCode)}</td><td className="p-2">{row.tariffActive?<strong>{row.unitPrice?.toFixed(2)} {row.currency}</strong>:<span className="text-amber-700">Нет в активном тарифе</span>}</td><td className="p-2"><input aria-label={`Включить ${row.label}`} checked={enabled} onChange={(event)=>{setEnabled(event.target.checked);if(!event.target.checked)setSuggested(false);}} type="checkbox"/></td><td className="p-2"><input aria-label={`Предлагать ${row.label} по умолчанию`} checked={suggested} disabled={!enabled} onChange={(event)=>setSuggested(event.target.checked)} type="checkbox"/></td><td className="p-2 text-right"><button className={actionClassName.secondary} disabled={pending} onClick={()=>startTransition(async()=>{const result=await upsertCctvObjectServiceBindingAction({objectType,serviceCode:row.serviceCode,enabled,calculatorDefault:suggested,displayOrder:row.displayOrder,notes:row.notes??"",expectedVersion:row.version});setMessage(result.message);if(result.success)onSaved(result.data);})} type="button"><Save className="size-4"/>Сохранить</button>{message&&<span className={`mt-1 block text-xs ${message.includes("сохранена")?"text-emerald-700":"text-red-700"}`}>{message}</span>}</td></tr>;
}

function SummaryWorkspace({configuration,diagnostics,objectType,preview}:{configuration:CctvObjectConfiguration;diagnostics:string[];objectType:(typeof CCTV_OBJECT_TYPES)[number];preview:ReturnType<typeof cameraPreview>}) {
  const enabled=configuration.services.filter((service)=>service.enabled);
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Камеры внутри" value={preview.indoor.eligible.length}/><Metric label="Камеры снаружи" value={preview.outdoor.eligible.length}/><Metric label="Услуги включены" value={enabled.length}/><Metric label="По умолчанию" value={enabled.filter((service)=>service.calculatorDefault).length}/></div>
    <section><h3 className="font-semibold">Диагностика</h3><div className="mt-2 space-y-2">{diagnostics.length?diagnostics.map((message)=><p className="flex gap-2 border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-sm" key={message}><AlertTriangle className="mt-0.5 size-4 shrink-0"/>{message}</p>):<p className="flex gap-2 border-l-4 border-emerald-500 bg-emerald-50 px-3 py-2 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0"/>Базовая конфигурация объекта готова.</p>}</div></section>
    <section className="grid gap-3 sm:grid-cols-2"><div className="rounded-md border border-zinc-200 p-3"><h3 className="font-semibold">B2B</h3><p className="mt-1 text-sm text-zinc-600">Общая камера-политика, объектные услуги и общий тариф. Ручная замена в смете сохраняется.</p><Link className={`${actionClassName.secondary} mt-3`} href="/cabinet/estimates/generator" target="_blank">Preview as B2B calculator<ExternalLink className="size-4"/></Link></div><div className="rounded-md border border-zinc-200 p-3"><h3 className="font-semibold">B2C</h3><p className="mt-1 text-sm text-zinc-600">Те же правила, только опубликованные Public Retail товары и безопасный публичный DTO.</p><Link className={`${actionClassName.secondary} mt-3`} href={`/calculator/cctv?object=${publicObjectType(objectType)}`} target="_blank">Preview as B2C calculator<ExternalLink className="size-4"/></Link></div></section>
  </div>;
}

function CandidateSearch({objectType,placement,onSaved}:{objectType:(typeof CCTV_OBJECT_TYPES)[number];placement:CctvCameraPlacement;onSaved:(row:CctvCameraPoolAdminRow)=>void}) {
  const [query,setQuery]=useState("");const [results,setResults]=useState<CctvCameraCandidateSearchRow[]>([]);const [message,setMessage]=useState<string|null>(null);const [pending,startTransition]=useTransition();
  const runSearch=()=>startTransition(async()=>{const result=await searchCctvCameraCandidatesAction({query,objectType,placement});setMessage(result.message);setResults(result.success?result.data:[]);});
  return <div className="space-y-3 border-y border-zinc-200 py-3"><div className="flex flex-col gap-2 sm:flex-row"><label className="min-w-0 flex-1 text-sm font-medium">Добавить кандидата<input className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 px-3" onChange={(event)=>setQuery(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();runSearch();}}} placeholder="SKU или модель" value={query}/></label><button className={`${actionClassName.secondary} sm:self-end`} disabled={pending||query.trim().length<2} onClick={runSearch} type="button"><Search className="size-4"/>Найти</button></div>
    {results.length>0&&<div className="grid gap-2 lg:grid-cols-2">{results.map((row)=><article className="flex min-w-0 gap-3 rounded-md border border-zinc-200 p-3" key={row.productId}><div className="relative size-16 shrink-0 overflow-hidden rounded border border-zinc-200 bg-zinc-50"><ProductThumbnail alt={row.name} sizes="64px" src={row.imageUrl} variant="sm"/></div><div className="min-w-0 flex-1"><strong className="block truncate" title={row.name}>{row.sku} · {row.name}</strong><p className="mt-1 text-xs text-zinc-600">{row.resolutionMp} Мп · остаток {row.availableStock} · продажи 90 дней {row.recentSalesQty}</p><p className="text-xs text-zinc-600">{row.retailPriceAmount==null?"RETAIL не опубликован":`${row.retailPriceAmount.toFixed(2)} ${row.retailPriceCurrency}`}</p></div><button aria-label={`Добавить ${row.sku} в пул`} className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-zinc-300" disabled={pending||row.alreadyInPool} onClick={()=>startTransition(async()=>{const result=await upsertCctvCameraPoolAction({objectType,placement,productId:row.productId,manualPriority:"normal",enabled:true,notes:"",expectedVersion:null});setMessage(result.message);if(result.success){onSaved(result.data);setResults((current)=>current.map((item)=>item.productId===row.productId?{...item,alreadyInPool:true}:item));}})} type="button"><Plus className="size-4"/></button></article>)}</div>}{message&&<ActionFeedback kind={message.includes("найдены")||message.includes("сохранён")?"success":"error"} message={message}/>}</div>;
}

function CandidateEditor({row,onSaved,onRemoved}:{row:CctvCameraPoolAdminRow;onSaved:(row:CctvCameraPoolAdminRow)=>void;onRemoved:(id:string)=>void}) {
  const [priority,setPriority]=useState(row.manualPriority);const [enabled,setEnabled]=useState(row.enabled);const [message,setMessage]=useState<string|null>(null);const [pending,startTransition]=useTransition();
  const diagnostics=[!row.technicalVerified&&"Нет подтверждённых метаданных",!row.publicPublished&&"Не опубликован в Public Retail",row.availableStock<=0&&"Нет доступного остатка"].filter(Boolean);
  return <tr className="border-b border-zinc-200 align-top"><td className="p-2"><div className="flex gap-2"><div className="relative size-12 shrink-0 overflow-hidden rounded border border-zinc-200 bg-zinc-50"><ProductThumbnail alt={row.name} sizes="48px" src={row.imageUrl} variant="sm"/></div><div><strong>{row.name}</strong><span className="block text-xs text-zinc-500">SKU {row.sku}</span></div></div></td><td className="p-2 text-xs">{row.resolutionMp} Мп<br/>{[row.colorNight&&"Color",row.anpr&&"ANPR",row.videoAnalytics&&"Analytics"].filter(Boolean).join(" · ")||"Базовый профиль"}<span className={`block ${diagnostics.length?"text-amber-700":"text-emerald-700"}`}>{diagnostics.join(" · ")||"Совместимость подтверждена"}</span></td><td className="p-2 text-xs">Остаток: {row.availableStock}<br/>Продажи 90 дней: {row.recentSalesQty}<br/>{row.retailPriceAmount==null?"RETAIL нет":`${row.retailPriceAmount.toFixed(2)} ${row.retailPriceCurrency}`}</td><td className="p-2"><select aria-label={`Приоритет ${row.sku}`} className="min-h-11 rounded-md border border-zinc-300 bg-white px-2" value={priority} onChange={(event)=>setPriority(event.target.value as typeof priority)}>{Object.entries(priorityLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></td><td className="p-2"><label className="flex min-h-11 items-center gap-2"><input checked={enabled} onChange={(event)=>setEnabled(event.target.checked)} type="checkbox"/>Включён</label></td><td className="p-2 text-right"><div className="flex justify-end gap-2"><button aria-label={`Сохранить ${row.sku}`} className="inline-flex size-11 items-center justify-center rounded-md border border-zinc-300" disabled={pending} onClick={()=>startTransition(async()=>{const result=await upsertCctvCameraPoolAction({objectType:row.objectType,placement:row.placement,productId:row.productId,manualPriority:priority,enabled,notes:row.notes??"",expectedVersion:row.version});setMessage(result.message);if(result.success)onSaved(result.data);})} type="button"><Save className="size-4"/></button><button aria-label={`Удалить ${row.sku} из пула`} className="inline-flex size-11 items-center justify-center rounded-md border border-red-200 text-red-700" disabled={pending} onClick={()=>startTransition(async()=>{const result=await removeCctvCameraPoolAction({candidateId:row.candidateId,expectedVersion:row.version});setMessage(result.message);if(result.success)onRemoved(row.candidateId);})} type="button"><Trash2 className="size-4"/></button></div>{message&&<span className={`mt-1 block text-xs ${message.includes("сохранён")||message.includes("удалён")?"text-emerald-700":"text-red-700"}`}>{message}</span>}</td></tr>;
}

function cameraPreview(rows:CctvCameraPoolAdminRow[],objectType:(typeof CCTV_OBJECT_TYPES)[number]) {
  const input={objectType,colorNight:false,licensePlateRecognition:false,videoAnalytics:false};
  const enrich=(selection:ReturnType<typeof selectCctvCameraCandidates>)=>{
    const byId=new Map(rows.map((row)=>[row.candidateId,row]));
    const eligible=selection.eligible.map((candidate)=>({...byId.get(candidate.candidateId)!,...candidate}));
    return {...selection,eligible,recommended:eligible[0]??null};
  };
  return {
    indoor: enrich(selectCctvCameraCandidates(input,{kind:"indoor_camera",cameraResolutionMp:4},rows)),
    outdoor: enrich(selectCctvCameraCandidates(input,{kind:"outdoor_camera",cameraResolutionMp:4},rows)),
  };
}
function Metric({label,value}:{label:string;value:number}) { return <div className="rounded-md border border-zinc-200 p-3"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>; }
function unitLabel(value:string) { return value==="piece"?"шт.":value==="meter"?"м":"услуга"; }
function publicObjectType(value:string) { return value==="industrial"?"production":value; }
