"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { archiveCampaignAction, duplicateCampaignAction, pauseCampaignAction, publishCampaignAction, resumeCampaignAction } from "../actions/commercial-campaign.actions";

type Props = { campaignId: string; status: string; canCreate?: boolean; canEdit?: boolean; canPublish?: boolean; canPause?: boolean; compact?: boolean };

export function CampaignAdminActions({ campaignId, status, canCreate = false, canEdit = false, canPublish = false, canPause = false, compact = false }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const run = (action: () => Promise<{ success: boolean; message: string; data: unknown }>, redirect?: (data: unknown) => string) => startTransition(async () => {
    const result = await action(); setMessage(result.message);
    if (result.success) { const href = redirect?.(result.data); if (href) router.push(href); else router.refresh(); }
  });
  const secondary = `${compact ? "min-h-9 px-3 text-xs" : "min-h-11 px-4 text-sm"} inline-flex items-center rounded-md border border-zinc-300 font-semibold text-zinc-700 disabled:opacity-50`;
  return <div className="flex flex-wrap items-center gap-2">
    <Link className={secondary} href={`/admin/commercial/campaigns/${campaignId}`}>Открыть</Link>
    {status === "draft" && canEdit ? <Link className={secondary} href={`/admin/commercial/campaigns/${campaignId}`}>Редактировать</Link> : null}
    <Link className={secondary} href={`/admin/commercial/campaigns/${campaignId}?preview=1`}>Предпросмотр</Link>
    {canCreate ? <button className={secondary} disabled={pending} onClick={() => run(() => duplicateCampaignAction(campaignId, crypto.randomUUID()), (data) => `/admin/commercial/campaigns/${(data as { id: string }).id}`)} type="button">Дублировать</button> : null}
    {status === "draft" && canPublish ? <button className={`${compact ? "min-h-9 px-3 text-xs" : "min-h-11 px-4 text-sm"} rounded-md bg-emerald-700 font-semibold text-white disabled:bg-zinc-300`} disabled={pending} onClick={() => run(() => publishCampaignAction(campaignId, crypto.randomUUID()))} type="button">Опубликовать</button> : null}
    {(["active", "scheduled"].includes(status)) && canPause ? <button className={secondary} disabled={pending} onClick={() => run(() => pauseCampaignAction(campaignId, "Приостановлено администратором"))} type="button">Приостановить</button> : null}
    {status === "paused" && canPause ? <button className={secondary} disabled={pending} onClick={() => run(() => resumeCampaignAction(campaignId, "Возобновлено администратором"))} type="button">Возобновить</button> : null}
    {(["draft", "paused", "completed"].includes(status)) && canEdit ? <button className={`${secondary} text-rose-700`} disabled={pending} onClick={() => run(() => archiveCampaignAction(campaignId, "Архивировано администратором"))} type="button">В архив</button> : null}
    {message ? <p className="basis-full text-xs text-zinc-600" role="status">{message}</p> : null}
  </div>;
}
