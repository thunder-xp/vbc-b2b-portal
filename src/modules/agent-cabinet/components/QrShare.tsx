"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Copy, Download, ExternalLink, Printer, Share2 } from "lucide-react";

import { primaryButton, secondaryButton } from "./PageHeader";
import type { AgentCabinetLocale } from "../copy";
import { CabinetFeedback } from "@/src/modules/cabinet-experience/components";

export function QrShare({ url, svg, fileName, locale = "ru" }: { url: string; svg: string; fileName: string; locale?: AgentCabinetLocale }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const ro = locale === "ro";
  const canShare = useSyncExternalStore(subscribeToShareCapability, readShareCapability, () => false);
  async function copy() {
    try { await navigator.clipboard.writeText(url); setFailed(false); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
    catch { setFailed(true); }
  }
  async function share() {
    try { await navigator.share({ title: "Novotech", url }); setFailed(false); }
    catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true); }
  }
  function download() {
    const objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const anchor = document.createElement("a"); anchor.href = objectUrl; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(objectUrl);
  }
  return <div className="space-y-3" id="referral-link"><div className="break-all rounded-lg bg-zinc-100 p-3 font-mono text-xs leading-5 text-zinc-700">{url}</div><div className="grid gap-2 sm:grid-cols-2">
    <button className={primaryButton} onClick={copy} type="button">{copied ? <Check size={18}/> : <Copy size={18}/>} {copied ? (ro ? "Copiat" : "Скопировано") : (ro ? "Copiază linkul" : "Копировать ссылку")}</button>
    {canShare ? <button className={secondaryButton} onClick={share} type="button"><Share2 size={18}/>{ro ? "Distribuie" : "Поделиться"}</button> : null}
    <a className={secondaryButton} href={url} rel="noreferrer" target="_blank"><ExternalLink size={18}/>{ro ? "Deschide formularul" : "Открыть форму рекомендации"}</a>
    <button className={secondaryButton} onClick={download} type="button"><Download size={18}/>{ro ? "Descarcă QR" : "Скачать QR"}</button>
    <button className={secondaryButton} onClick={() => window.print()} type="button"><Printer size={18}/>{ro ? "Tipărește" : "Печать"}</button>
  </div>{failed ? <CabinetFeedback tone="error">{ro ? "Acțiunea nu a reușit. Încercați din nou." : "Не удалось выполнить действие. Попробуйте ещё раз."}</CabinetFeedback> : null}</div>;
}

function subscribeToShareCapability() {
  return () => undefined;
}

function readShareCapability() {
  return typeof navigator.share === "function";
}
