"use client";

import { AlertTriangle, Building2, Check, Eye, EyeOff, ImageUp, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { capabilityLabel, PublicPartnerCard } from "@/src/modules/public-retail/components/PublicPartnerDirectory";
import { PUBLIC_PARTNER_CAPABILITY_CODES } from "@/src/modules/public-retail/types";

import {
  updateAdminCompanyLogoAction,
  updateAdminPublicPartnerDirectoryAction,
  type AdminCompanyLogoActionState,
  type AdminPublicPartnerDirectoryActionState,
} from "../actions";
import type { AdminPublicPartnerDirectoryPage, AdminPublicPartnerDirectoryRecord } from "../types";
import { AdminPageHeader } from "./AdminPageHeader";

const INITIAL: AdminPublicPartnerDirectoryActionState = { status: "idle", message: "" };
const INITIAL_LOGO: AdminCompanyLogoActionState = { status: "idle", message: "" };
const FILTERS = {
  all: "Все активные",
  visible: "Опубликованные",
  hidden: "Скрытые",
  missing_logo: "Без публичного логотипа",
  missing_public_name: "Без публичного названия",
  incomplete: "Неполные профили",
  name_review: "PUBLIC_NAME_REVIEW",
} as const;
const COMPLETENESS = {
  publicName: "Название",
  logo: "Логотип",
  descriptionRu: "Описание RU",
  descriptionRo: "Описание RO",
  locality: "Локация",
  capabilities: "Компетенции",
  publicContact: "Контакт",
  website: "Сайт",
} as const;
const DIRECTORY_DATE_TIME = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Europe/Chisinau",
});

export function AdminPublicPartnerDirectory({ page }: { page: AdminPublicPartnerDirectoryPage }) {
  return <div className="space-y-6">
    <AdminPageHeader
      description="Единая управляемая публичная проекция: название, адрес профиля, RU/RO-описания, локация, контакты, логотип и компетенции. Приватные и Marketplace-данные не используются."
      eyebrow="Партнёры"
      title="Публичное сообщество партнёров"
    />
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="inline-flex min-h-10 items-center gap-2 border border-zinc-200 bg-white px-3"><Eye aria-hidden className="size-4 text-emerald-700" />Опубликовано: {page.publishedCount}</span>
      <Link className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-3 font-semibold hover:border-emerald-500" href="/partners" target="_blank">Открыть публичную страницу</Link>
    </div>
    <form className="grid gap-3 border border-zinc-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_15rem_auto]">
      <label className="grid gap-1 text-sm font-medium">Поиск
        <input className="min-h-11 min-w-0 border border-zinc-300 px-3" defaultValue={page.search} maxLength={100} name="search" placeholder="Компания, публичное название или slug" />
      </label>
      <label className="grid gap-1 text-sm font-medium">Состояние
        <select className="min-h-11 border border-zinc-300 bg-white px-3" defaultValue={page.filter} name="filter">
          {Object.entries(FILTERS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <button className="min-h-11 self-end bg-zinc-950 px-4 text-sm font-semibold text-white">Применить</button>
    </form>
    <section className="space-y-4" aria-label="Компании">
      {page.records.length ? page.records.map((record) => <GovernanceRow key={`${record.companyId}:${record.revision}`} record={record} />) : <p className="border border-zinc-200 bg-white px-5 py-12 text-center text-sm text-zinc-500">Компании по выбранным условиям не найдены.</p>}
    </section>
    <Pagination page={page} />
  </div>;
}

function GovernanceRow({ record }: { record: AdminPublicPartnerDirectoryRecord }) {
  const [state, action, pending] = useActionState(updateAdminPublicPartnerDirectoryAction, INITIAL);
  const [publicName, setPublicName] = useState(record.publicDisplayName ?? "");
  const [locality, setLocality] = useState(record.locality ?? "");
  const [visible, setVisible] = useState(record.visible);
  const [useCurrentLogo, setUseCurrentLogo] = useState(Boolean(record.currentLogoUrl && record.currentLogoUrl === record.approvedLogoUrl));
  const previewName = publicName.trim() || "Название для публикации";
  const complete = Object.values(record.completeness).every(Boolean);

  return <article className="border border-zinc-200 bg-white p-4 sm:p-5">
    <div className="grid gap-5 xl:grid-cols-[minmax(16rem,0.8fr)_minmax(30rem,1.7fr)_16rem] xl:items-start">
      <CompanyLogoControl record={record} />
      <form action={action} className="grid gap-4">
        <input name="companyId" type="hidden" value={record.companyId} />
        <input name="revision" type="hidden" value={record.revision} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">Публичное название
            <input className="min-h-11 min-w-0 border border-zinc-300 px-3" maxLength={160} name="publicDisplayName" onChange={(event) => setPublicName(event.target.value)} required={visible} value={publicName} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">Публичный адрес
            <input className="min-h-11 min-w-0 border border-zinc-300 px-3" defaultValue={record.publicSlug ?? ""} maxLength={120} name="publicSlug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="company-name" />
          </label>
        </div>
        {record.publicNameReview ? <p className="flex items-center gap-2 text-sm font-semibold text-amber-700"><AlertTriangle aria-hidden className="size-4" />PUBLIC_NAME_REVIEW: название длиннее 60 символов; не изменено автоматически.</p> : null}
        <details className="border border-zinc-200" open={!complete}>
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold">Публичное содержание RU / RO</summary>
          <div className="grid gap-3 border-t border-zinc-200 p-3">
            <div className="grid gap-3 lg:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">Описание на русском
                <textarea className="min-h-28 resize-y border border-zinc-300 p-3 text-sm" defaultValue={record.descriptionRu ?? ""} maxLength={2000} name="descriptionRu" />
              </label>
              <label className="grid gap-1 text-sm font-medium">Descriere în română
                <textarea className="min-h-28 resize-y border border-zinc-300 p-3 text-sm" defaultValue={record.descriptionRo ?? ""} maxLength={2000} name="descriptionRo" />
              </label>
            </div>
            <label className="grid gap-1 text-sm font-medium">Публичный город / регион
              <input className="min-h-11 border border-zinc-300 px-3" maxLength={120} name="locality" onChange={(event) => setLocality(event.target.value)} placeholder="Chișinău" value={locality} />
            </label>
            <div className="grid gap-3 lg:grid-cols-3">
              <label className="grid gap-1 text-sm font-medium">Публичный email
                <input className="min-h-11 min-w-0 border border-zinc-300 px-3" defaultValue={record.publicEmail ?? ""} maxLength={254} name="publicEmail" type="email" />
              </label>
              <label className="grid gap-1 text-sm font-medium">Публичный телефон
                <input className="min-h-11 min-w-0 border border-zinc-300 px-3" defaultValue={record.publicPhone ?? ""} maxLength={16} name="publicPhone" pattern="\+[1-9][0-9]{7,14}" placeholder="+373XXXXXXXX" type="tel" />
              </label>
              <label className="grid gap-1 text-sm font-medium">Публичный сайт
                <input className="min-h-11 min-w-0 border border-zinc-300 px-3" defaultValue={record.publicWebsite ?? ""} maxLength={500} name="publicWebsite" placeholder="https://example.md" type="url" />
              </label>
            </div>
          </div>
        </details>
        <fieldset className="border border-zinc-200 p-3"><legend className="px-1 text-sm font-semibold">Публичные компетенции</legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{PUBLIC_PARTNER_CAPABILITY_CODES.map((code) => {
            const current = record.capabilities.find((capability) => capability.code === code);
            return <div className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-2 border border-zinc-100 p-2" key={code}>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input defaultChecked={Boolean(current)} name={`capability-${code}`} type="checkbox" />{capabilityLabel("ru", code)}</label>
              <select aria-label={`Статус ${capabilityLabel("ru", code)}`} className="min-h-11 min-w-0 border border-zinc-300 bg-white px-2 text-xs" defaultValue={current?.evidenceStatus ?? "SELF_DECLARED"} name={`capability-evidence-${code}`}><option value="SELF_DECLARED">Заявлено</option><option value="VERIFIED">Подтверждено</option></select>
            </div>;
          })}</div>
        </fieldset>
        <label className={`flex min-h-11 items-center gap-3 text-sm ${record.currentLogoUrl ? "" : "text-zinc-400"}`}><input checked={useCurrentLogo} disabled={!record.currentLogoUrl || pending} name="useCurrentLogo" onChange={(event) => setUseCurrentLogo(event.target.checked)} type="checkbox" />Использовать текущий логотип компании</label>
        {!record.currentLogoUrl ? <p className="text-xs text-zinc-500">Логотип отсутствует: публичная карточка использует безопасную заглушку.</p> : null}
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input checked={visible} disabled={pending} name="visible" onChange={(event) => setVisible(event.target.checked)} type="checkbox" />Показывать в каталоге партнёров</label>
        {visible && !publicName.trim() ? <p className="text-sm text-amber-700">Для публикации укажите публичное название.</p> : null}
        <div className="flex flex-wrap items-center gap-3"><button className="min-h-11 bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={pending || (visible && !publicName.trim())} type="submit">{pending ? "Сохранение..." : "Сохранить"}</button><span aria-live="polite" className={`text-sm ${state.status === "error" || state.status === "conflict" ? "text-red-700" : "text-emerald-700"}`}>{state.message}</span></div>
      </form>
      <div className="space-y-4">
        <div><p className="mb-2 text-xs font-semibold uppercase text-zinc-500">Предпросмотр карточки</p><PublicPartnerCard locale="ru" partner={{ slug: record.publicSlug, displayName: previewName, logoUrl: useCurrentLogo ? record.currentLogoUrl : null, locality: locality.trim() || null, capabilities: record.capabilities, updatedAt: record.updatedAt }} /></div>
        <div><p className="text-xs font-semibold uppercase text-zinc-500">Готовность</p><ul className="mt-2 flex flex-wrap gap-1.5">{Object.entries(COMPLETENESS).map(([key, label]) => {
          const ready = record.completeness[key as keyof typeof record.completeness];
          return <li className={`inline-flex min-h-7 items-center gap-1 border px-2 text-[11px] ${ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`} key={key}>{ready ? <Check aria-hidden className="size-3" /> : null}{label}</li>;
        })}</ul><p className="mt-2 text-xs font-semibold">{complete ? "COMPLETE" : "INCOMPLETE"}</p></div>
      </div>
    </div>
  </article>;
}

function CompanyLogoControl({ record }: { record: AdminPublicPartnerDirectoryRecord }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(updateAdminCompanyLogoAction, INITIAL_LOGO);
  useEffect(() => { if (state.status === "success") router.refresh(); }, [router, state.status]);
  return <div className="min-w-0"><div className="flex items-start gap-3"><div className="relative grid size-24 shrink-0 place-items-center overflow-hidden border border-zinc-200 bg-zinc-50">{record.currentLogoUrl ? <Image alt={`Логотип ${record.companyName}`} className="object-contain p-2" fill sizes="96px" src={record.currentLogoUrl} /> : <Building2 aria-hidden className="size-9 text-zinc-300" />}</div><div className="min-w-0"><h2 className="break-words font-semibold">{record.companyName}</h2><p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">{record.visible ? <Eye aria-hidden className="size-3.5 text-emerald-700" /> : <EyeOff aria-hidden className="size-3.5" />}{record.visible ? "Показывается публично" : "Скрыта"}</p><p className="mt-2 text-xs text-zinc-500">Версия {record.revision}{record.updatedAt ? ` · обновлено ${DIRECTORY_DATE_TIME.format(new Date(record.updatedAt))}` : ""}</p></div></div>
    <form action={action} className="mt-4 grid gap-3"><input name="companyId" type="hidden" value={record.companyId} /><input name="revision" type="hidden" value={record.revision} /><label className="sr-only" htmlFor={`company-logo-${record.companyId}`}>Файл логотипа</label><input accept="image/png,image/jpeg,image/webp" className="min-h-11 min-w-0 border border-zinc-300 bg-white px-3 py-2 text-sm file:mr-3 file:border-0 file:bg-transparent file:font-semibold" disabled={pending} id={`company-logo-${record.companyId}`} name="logo" required type="file" /><div className="flex flex-wrap gap-2"><button className="inline-flex min-h-11 items-center justify-center gap-2 bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={pending} type="submit"><ImageUp aria-hidden className="size-4" />{pending ? "Загрузка..." : record.currentLogoUrl ? "Заменить логотип" : "Загрузить логотип"}</button>{record.currentLogoUrl ? <button className="inline-flex min-h-11 items-center justify-center gap-2 border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 disabled:opacity-50" disabled={pending} formNoValidate name="intent" type="submit" value="remove"><Trash2 aria-hidden className="size-4" />Удалить логотип</button> : null}</div><p aria-live="polite" className={`text-sm ${state.status === "error" || state.status === "conflict" ? "text-red-700" : "text-emerald-700"}`}>{state.message}</p></form>
  </div>;
}

function Pagination({ page }: { page: AdminPublicPartnerDirectoryPage }) {
  if (page.totalPages <= 1) return null;
  return <nav aria-label="Страницы каталога партнёров" className="flex items-center justify-between text-sm">{page.page > 1 ? <Link href={pageHref(page, page.page - 1)}>Назад</Link> : <span />}<span>{page.page} из {page.totalPages}</span>{page.page < page.totalPages ? <Link href={pageHref(page, page.page + 1)}>Далее</Link> : <span />}</nav>;
}

function pageHref(page: AdminPublicPartnerDirectoryPage, target: number) {
  const params = new URLSearchParams({ page: String(target), filter: page.filter });
  if (page.search) params.set("search", page.search);
  return `/admin/partners/public-directory?${params}`;
}
