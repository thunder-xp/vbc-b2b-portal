"use client";

import { Building2, Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";

import { PublicPartnerCard } from "@/src/modules/public-retail/components/PublicPartnerDirectory";

import {
  updateAdminPublicPartnerDirectoryAction,
  type AdminPublicPartnerDirectoryActionState,
} from "../actions";
import type { AdminPublicPartnerDirectoryPage, AdminPublicPartnerDirectoryRecord } from "../types";
import { AdminPageHeader } from "./AdminPageHeader";

const INITIAL: AdminPublicPartnerDirectoryActionState = { status: "idle", message: "" };
const FILTERS = {
  all: "Все активные",
  visible: "Опубликованные",
  hidden: "Скрытые",
  missing_logo: "Без логотипа",
  missing_public_name: "Без публичного названия",
} as const;
const DIRECTORY_DATE_TIME = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Europe/Chisinau",
});

export function AdminPublicPartnerDirectory({ page }: { page: AdminPublicPartnerDirectoryPage }) {
  return <div className="space-y-6">
    <AdminPageHeader
      description="Управление названием и логотипом, которые видит посетитель публичного каталога партнёров. Коммерческие данные здесь не используются."
      eyebrow="Партнёры"
      title="Публичный каталог партнёров"
    />
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="inline-flex min-h-10 items-center gap-2 border border-zinc-200 bg-white px-3">
        <Eye aria-hidden className="size-4 text-emerald-700" />
        Опубликовано: {page.publishedCount}
      </span>
      <Link className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-3 font-semibold hover:border-emerald-500" href="/partners" target="_blank">
        Открыть публичную страницу
      </Link>
    </div>
    <form className="grid gap-3 border border-zinc-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_15rem_auto]">
      <label className="grid gap-1 text-sm font-medium">Поиск
        <input className="min-h-11 min-w-0 border border-zinc-300 px-3" defaultValue={page.search} maxLength={100} name="search" placeholder="Название компании или публичное название" />
      </label>
      <label className="grid gap-1 text-sm font-medium">Состояние
        <select className="min-h-11 border border-zinc-300 bg-white px-3" defaultValue={page.filter} name="filter">
          {Object.entries(FILTERS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <button className="min-h-11 self-end bg-zinc-950 px-4 text-sm font-semibold text-white">Применить</button>
    </form>
    <section className="space-y-4" aria-label="Компании">
      {page.records.length ? page.records.map((record) => <GovernanceRow key={record.companyId} record={record} />) : <p className="border border-zinc-200 bg-white px-5 py-12 text-center text-sm text-zinc-500">Компании по выбранным условиям не найдены.</p>}
    </section>
    <Pagination page={page} />
  </div>;
}

function GovernanceRow({ record }: { record: AdminPublicPartnerDirectoryRecord }) {
  const [state, action, pending] = useActionState(updateAdminPublicPartnerDirectoryAction, INITIAL);
  const [publicName, setPublicName] = useState(record.publicDisplayName ?? "");
  const [visible, setVisible] = useState(record.visible);
  const [useCurrentLogo, setUseCurrentLogo] = useState(Boolean(record.currentLogoUrl && record.currentLogoUrl === record.approvedLogoUrl));
  const previewName = publicName.trim() || "Название для публикации";

  return <article className="border border-zinc-200 bg-white p-4 sm:p-5">
    <form action={action} className="grid gap-5 xl:grid-cols-[minmax(12rem,0.8fr)_minmax(20rem,1.5fr)_15rem] xl:items-start">
      <input name="companyId" type="hidden" value={record.companyId} />
      <input name="revision" type="hidden" value={record.revision} />
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <div className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-md border border-zinc-200 bg-zinc-50">
            {record.currentLogoUrl ? <Image alt="" className="object-contain p-2" fill sizes="64px" src={record.currentLogoUrl} /> : <Building2 aria-hidden className="size-7 text-zinc-300" />}
          </div>
          <div className="min-w-0">
            <h2 className="break-words font-semibold">{record.companyName}</h2>
            <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
              {record.visible ? <Eye aria-hidden className="size-3.5 text-emerald-700" /> : <EyeOff aria-hidden className="size-3.5" />}
              {record.visible ? "Показывается публично" : "Скрыта"}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-zinc-500">Версия {record.revision}{record.updatedAt ? ` · обновлено ${DIRECTORY_DATE_TIME.format(new Date(record.updatedAt))}` : ""}</p>
      </div>
      <div className="grid gap-4">
        <label className="grid gap-1.5 text-sm font-medium">Публичное название
          <input className="min-h-11 min-w-0 border border-zinc-300 px-3" maxLength={160} name="publicDisplayName" onChange={(event) => setPublicName(event.target.value)} required={visible} value={publicName} />
        </label>
        <label className={`flex min-h-11 items-center gap-3 text-sm ${record.currentLogoUrl ? "" : "text-zinc-400"}`}>
          <input checked={useCurrentLogo} disabled={!record.currentLogoUrl || pending} name="useCurrentLogo" onChange={(event) => setUseCurrentLogo(event.target.checked)} type="checkbox" />
          Использовать текущий логотип компании
        </label>
        {!record.currentLogoUrl ? <p className="text-xs text-zinc-500">Логотип отсутствует: публичная карточка использует безопасную заглушку.</p> : null}
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input checked={visible} disabled={pending} name="visible" onChange={(event) => setVisible(event.target.checked)} type="checkbox" />
          Показывать в каталоге партнёров
        </label>
        {visible && !publicName.trim() ? <p className="text-sm text-amber-700">Для публикации укажите публичное название.</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          <button className="min-h-11 bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={pending || (visible && !publicName.trim())} type="submit">{pending ? "Сохранение..." : "Сохранить"}</button>
          <span aria-live="polite" className={`text-sm ${state.status === "error" || state.status === "conflict" ? "text-red-700" : "text-emerald-700"}`}>{state.message}</span>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-zinc-500">Предпросмотр карточки</p>
        <PublicPartnerCard partner={{ displayName: previewName, logoUrl: useCurrentLogo ? record.currentLogoUrl : null }} />
      </div>
    </form>
  </article>;
}

function Pagination({ page }: { page: AdminPublicPartnerDirectoryPage }) {
  if (page.totalPages <= 1) return null;
  return <nav aria-label="Страницы каталога партнёров" className="flex items-center justify-between text-sm">
    {page.page > 1 ? <Link href={pageHref(page, page.page - 1)}>Назад</Link> : <span />}
    <span>{page.page} из {page.totalPages}</span>
    {page.page < page.totalPages ? <Link href={pageHref(page, page.page + 1)}>Далее</Link> : <span />}
  </nav>;
}

function pageHref(page: AdminPublicPartnerDirectoryPage, target: number) {
  const params = new URLSearchParams({ page: String(target), filter: page.filter });
  if (page.search) params.set("search", page.search);
  return `/admin/partners/public-directory?${params}`;
}
