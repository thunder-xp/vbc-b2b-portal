"use client";

import { useActionState, useState } from "react";

import {
  updateAdminCompanyAccessAction,
  type CompanyAccessActionState,
} from "../actions";
import type {
  AdminCompanyAccess,
  PartnerAccessPresetCode,
} from "../types";

const INITIAL_STATE: CompanyAccessActionState = {
  status: "idle",
  message: "",
  correlationId: null,
};

const PRESET_LABELS: Record<PartnerAccessPresetCode, string> = {
  full_partner_access: "Полный доступ",
  orders_only: "Только заказы",
  catalog_only: "Только каталог",
  custom: "Настраиваемый",
};

const CATEGORY_LABELS: Record<string, string> = {
  catalog: "Каталог",
  pricing: "Цены",
  inventory: "Наличие",
  orders: "Заказы",
  finance: "Финансы",
  documents: "Документы",
  estimates: "Сметы и КП",
  specifications: "Проектная защита",
  reservations: "Резервирование",
  purchasing: "Закупки",
  commercial: "Коммерческие возможности",
};

export function AdminCompanyPlatformAccess({
  access,
  conflict = false,
  returnPath,
}: {
  access: AdminCompanyAccess;
  conflict?: boolean;
  returnPath: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateAdminCompanyAccessAction,
    INITIAL_STATE,
  );
  const [preset, setPreset] = useState(access.presetCode);
  const [enabled, setEnabled] = useState(
    () => new Set(access.capabilities.filter((item) => item.enabled).map((item) => item.code)),
  );

  const applyPreset = (code: PartnerAccessPresetCode) => {
    setPreset(code);
    const selected = access.presets.find((item) => item.code === code);
    if (code !== "custom" && selected) setEnabled(new Set(selected.permissionCodes));
  };
  const toggleCapability = (code: string) => {
    setPreset("custom");
    setEnabled((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };
  const categories = Map.groupBy(access.capabilities, (item) => item.category);

  return (
    <section className="border border-zinc-200 bg-white" aria-labelledby="platform-access-title">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="font-semibold" id="platform-access-title">Platform access</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Функции компании настраиваются вручную и не зависят от статуса партнёра или вида цены в 1С.
        </p>
      </div>
      <form action={formAction} className="space-y-5 p-5">
        <input name="companyId" type="hidden" value={access.companyId} />
        <input name="returnPath" type="hidden" value={returnPath} />
        <input name="version" type="hidden" value={access.version} />
        <fieldset disabled={!access.canManage || pending}>
          <legend className="text-sm font-semibold text-zinc-900">Профиль доступа</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {access.presets.map((item) => (
              <label className="flex min-h-11 cursor-pointer items-center gap-2 border border-zinc-200 px-3 py-2 text-sm" key={item.code}>
                <input
                  checked={preset === item.code}
                  name="presetCode"
                  onChange={() => applyPreset(item.code)}
                  type="radio"
                  value={item.code}
                />
                {PRESET_LABELS[item.code]}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Эффективный доступ компании</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Пользователь получит функцию только тогда, когда её также разрешает его роль. Управление пользователями здесь не настраивается.
          </p>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {[...categories.entries()].map(([category, capabilities]) => (
              <fieldset className="border border-zinc-200 p-3" disabled={!access.canManage || pending} key={category}>
                <legend className="px-1 text-xs font-semibold uppercase text-zinc-500">
                  {CATEGORY_LABELS[category] ?? category}
                </legend>
                <div className="space-y-2">
                  {capabilities.map((capability) => (
                    <label className="flex min-h-11 items-start gap-3 text-sm" key={capability.code}>
                      <input
                        checked={enabled.has(capability.code)}
                        className="mt-1"
                        name="capabilities"
                        onChange={() => toggleCapability(capability.code)}
                        type="checkbox"
                        value={capability.code}
                      />
                      <span>
                        <span className="block font-medium text-zinc-900">{capability.code}</span>
                        <span className="block text-xs text-zinc-500">{capability.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </div>

        <label className="block text-sm font-medium text-zinc-900">
          Причина или внутренняя заметка
          <textarea
            className="mt-2 min-h-24 w-full border border-zinc-300 px-3 py-2 text-sm"
            defaultValue={access.changeNote ?? ""}
            maxLength={500}
            name="note"
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-4">
          <p className="text-xs text-zinc-500">
            Версия {access.version} · {access.changedBy ?? "Система"} · {new Date(access.changedAt).toLocaleString("ru-RU")}
          </p>
          {access.canManage ? (
            <button className="min-h-11 bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">
              {pending ? "Сохранение..." : "Сохранить доступ"}
            </button>
          ) : null}
        </div>
        <p aria-live="polite" className={state.status === "success" ? "text-sm text-emerald-700" : "text-sm text-red-700"}>
          {conflict
            ? "Доступ уже изменён другим администратором. Обновите данные и повторите попытку."
            : state.message}
        </p>
      </form>
      <div className="border-t border-zinc-200 px-5 py-4">
        <h3 className="text-sm font-semibold">Последние изменения</h3>
        <ul className="mt-2 space-y-2 text-xs text-zinc-600">
          {access.recentEvents.map((event) => (
            <li key={`${event.version}-${event.occurredAt}`}>
              {new Date(event.occurredAt).toLocaleString("ru-RU")} · {event.actorName ?? "Система"} · {PRESET_LABELS[event.presetCode]}
              {event.note ? ` · ${event.note}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
