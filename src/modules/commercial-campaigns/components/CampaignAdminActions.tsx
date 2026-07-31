"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { pauseCampaignAction, publishCampaignAction } from "../actions/commercial-campaign.actions";

export function CampaignAdminActions({ campaignId, status, canPublish, canPause }: { campaignId: string; status: string; canPublish: boolean; canPause: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  return <div className="flex flex-wrap items-center gap-3">
    {status === "draft" && canPublish ? <button className="min-h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-zinc-300" disabled={pending} onClick={() => startTransition(async () => { const result = await publishCampaignAction(campaignId, crypto.randomUUID()); setMessage(result.message); if (result.success) router.refresh(); })} type="button">Опубликовать кампанию</button> : null}
    {(["active", "scheduled"].includes(status)) && canPause ? <button className="min-h-11 rounded-md border border-rose-300 px-4 text-sm font-semibold text-rose-700" disabled={pending} onClick={() => startTransition(async () => { const result = await pauseCampaignAction(campaignId, "Приостановлено администратором"); setMessage(result.message); if (result.success) router.refresh(); })} type="button">Приостановить</button> : null}
    {message ? <p className="text-sm" role="status">{message}</p> : null}
  </div>;
}
