"use client";

import { useState } from "react";
import { Check, Copy, Download, ExternalLink, Printer } from "lucide-react";

import { primaryButton, secondaryButton } from "./PageHeader";
import type { AgentCabinetLocale } from "../copy";

export function QrShare({ url, svg, fileName, locale = "ru" }: { url: string; svg: string; fileName: string; locale?: AgentCabinetLocale }) {
  const [copied, setCopied] = useState(false);
  const ro = locale === "ro";
  async function copy() { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
  function download() {
    const objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const anchor = document.createElement("a"); anchor.href = objectUrl; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(objectUrl);
  }
  return <div className="space-y-4" id="referral-link"><div className="break-all border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs">{url}</div><div className="grid gap-2 sm:grid-cols-2">
    <button className={primaryButton} onClick={copy} type="button">{copied ? <Check size={18}/> : <Copy size={18}/>} {copied ? (ro ? "Copiat" : "Скопировано") : (ro ? "Copiază linkul" : "Копировать ссылку")}</button>
    <a className={secondaryButton} href={url} rel="noreferrer" target="_blank"><ExternalLink size={18}/>{ro ? "Adaugă client" : "Добавить клиента"}</a>
    <button className={secondaryButton} onClick={download} type="button"><Download size={18}/>{ro ? "Descarcă QR" : "Скачать QR"}</button>
    <button className={secondaryButton} onClick={() => window.print()} type="button"><Printer size={18}/>{ro ? "Tipărește" : "Печать"}</button>
  </div></div>;
}
