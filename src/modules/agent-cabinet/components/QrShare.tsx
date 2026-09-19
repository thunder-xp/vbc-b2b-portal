"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download, ExternalLink, Printer, Share2 } from "lucide-react";

import { primaryButton, secondaryButton } from "./PageHeader";
import type { AgentCabinetLocale } from "../copy";

export function QrShare({ url, svg, fileName, locale = "ru" }: { url: string; svg: string; fileName: string; locale?: AgentCabinetLocale }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [failed, setFailed] = useState(false);
  const ro = locale === "ro";
  useEffect(() => setCanShare(typeof navigator.share === "function"), []);
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
  return <div className="space-y-3" id="referral-link"><div className="break-all rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs">{url}</div><div className="grid gap-2 sm:grid-cols-2">
    <button className={primaryButton} onClick={copy} type="button">{copied ? <Check size={18}/> : <Copy size={18}/>} {copied ? (ro ? "Copiat" : "Скопировано") : (ro ? "Copiază linkul" : "Копировать ссылку")}</button>
    {canShare ? <button className={secondaryButton} onClick={share} type="button"><Share2 size={18}/>{ro ? "Distribuie" : "Поделиться"}</button> : null}
    <a className={secondaryButton} href={url} rel="noreferrer" target="_blank"><ExternalLink size={18}/>{ro ? "Deschide formularul" : "Открыть форму рекомендации"}</a>
    <button className={secondaryButton} onClick={download} type="button"><Download size={18}/>{ro ? "Descarcă QR" : "Скачать QR"}</button>
    <button className={secondaryButton} onClick={() => window.print()} type="button"><Printer size={18}/>{ro ? "Tipărește" : "Печать"}</button>
  </div>{failed ? <p className="text-sm text-red-700" role="status">{ro ? "Acțiunea nu a reușit. Încercați din nou." : "Не удалось выполнить действие. Попробуйте ещё раз."}</p> : null}</div>;
}
