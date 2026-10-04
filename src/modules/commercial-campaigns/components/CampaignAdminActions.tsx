"use client";

import { Archive, Copy, Eye, ExternalLink, Pencil, Play, Rocket, Square, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { ConfirmationDialog, IconActionTooltip } from "../../platform-ui";
import {
  archiveCampaignAction,
  deleteArchivedCampaignAction,
  duplicateCampaignAction,
  pauseCampaignAction,
  publishCampaignAction,
  reopenCampaignForEditAction,
  resumeCampaignAction,
} from "../actions/commercial-campaign.actions";

type Props = { campaignId: string; status: string; canCreate?: boolean; canEdit?: boolean; canPublish?: boolean; canPause?: boolean; compact?: boolean };

const compactAction = "inline-flex size-9 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45";

export function CampaignAdminActions({ campaignId, status, canCreate = false, canEdit = false, canPublish = false, canPause = false, compact = false }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const run = (action: () => Promise<{ success: boolean; message: string; data: unknown }>, redirect?: (data: unknown) => string) => startTransition(async () => {
    const result = await action();
    setMessage(result.message);
    if (result.success) {
      const href = redirect?.(result.data);
      if (href) router.push(href);
      router.refresh();
    }
  });
  const removeArchived = () => run(
    () => deleteArchivedCampaignAction(campaignId, "Удалено администратором из архива"),
    () => "/admin/commercial/campaigns?status=archived",
  );

  return <div>
    <div className="flex flex-wrap items-center gap-1.5">
      <Action compact={compact} href={`/admin/commercial/campaigns/${campaignId}`} icon={<ExternalLink />} label="Открыть" />
      {status === "draft" && canEdit ? <Action compact={compact} href={`/admin/commercial/campaigns/${campaignId}`} icon={<Pencil />} label="Редактировать" /> : null}
      <Action compact={compact} href={`/admin/commercial/campaigns/${campaignId}?preview=1`} icon={<Eye />} label="Предпросмотр" />
      {canCreate ? <Action compact={compact} disabled={pending} icon={<Copy />} label="Дублировать" onClick={() => run(() => duplicateCampaignAction(campaignId, crypto.randomUUID()), (data) => `/admin/commercial/campaigns/${(data as { id: string }).id}`)} /> : null}
      {status === "draft" && canPublish ? <Action compact={compact} disabled={pending} icon={<Rocket />} label="Опубликовать" onClick={() => run(() => publishCampaignAction(campaignId, crypto.randomUUID()))} primary /> : null}
      {(["active", "scheduled"].includes(status)) && canPause ? <Action compact={compact} disabled={pending} icon={<Square />} label="Остановить" onClick={() => run(() => pauseCampaignAction(campaignId, "Остановлено администратором"))} /> : null}
      {status === "paused" && canEdit ? <Action compact={compact} disabled={pending} icon={<Pencil />} label="Открыть для редактирования" onClick={() => run(() => reopenCampaignForEditAction(campaignId, "Открыто администратором для редактирования"), () => `/admin/commercial/campaigns/${campaignId}`)} /> : null}
      {status === "paused" && canPause ? <Action compact={compact} disabled={pending} icon={<Play />} label="Возобновить без изменений" onClick={() => run(() => resumeCampaignAction(campaignId, "Возобновлено администратором"))} /> : null}
      {(["draft", "paused", "completed"].includes(status)) && canEdit ? <Action compact={compact} disabled={pending} icon={<Archive />} label="В архив" onClick={() => run(() => archiveCampaignAction(campaignId, "Архивировано администратором"))} /> : null}
      {status === "archived" && canEdit ? <Action compact={compact} destructive disabled={pending} icon={<Trash2 />} label="Удалить архивное предложение" onClick={() => setDeleteOpen(true)} /> : null}
    </div>
    {message ? <p className={compact ? "sr-only" : "mt-2 text-xs text-zinc-600"} role="status">{message}</p> : null}
    <ConfirmationDialog confirmLabel="Удалить" consequence="Предложение исчезнет из рабочего списка. Опубликованные версии и журнал аудита сохранятся." destructive onCancel={() => setDeleteOpen(false)} onConfirm={removeArchived} open={deleteOpen} pending={pending} title="Удалить архивное предложение?" />
  </div>;
}

function Action({ compact, destructive = false, disabled = false, href, icon, label, onClick, primary = false }: {
  compact: boolean;
  destructive?: boolean;
  disabled?: boolean;
  href?: string;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  primary?: boolean;
}) {
  const iconNode = <span aria-hidden="true" className="[&>svg]:size-4">{icon}</span>;
  if (compact) {
    const className = `${compactAction} ${destructive ? "text-rose-700" : ""} ${primary ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800" : ""}`;
    const control = href
      ? <Link aria-label={label} className={className} href={href}>{iconNode}</Link>
      : <button aria-label={label} className={className} disabled={disabled} onClick={onClick} type="button">{iconNode}</button>;
    return <IconActionTooltip align="end" label={label}>{control}</IconActionTooltip>;
  }
  const className = `inline-flex min-h-11 items-center gap-2 rounded-md px-4 text-sm font-semibold disabled:opacity-50 ${destructive ? "border border-rose-300 text-rose-700" : primary ? "bg-emerald-700 text-white" : "border border-zinc-300 text-zinc-700"}`;
  return href
    ? <Link className={className} href={href}>{iconNode}{label}</Link>
    : <button className={className} disabled={disabled} onClick={onClick} type="button">{iconNode}{label}</button>;
}
