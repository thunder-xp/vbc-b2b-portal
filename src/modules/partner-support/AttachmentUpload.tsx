"use client";
import { useState } from "react";
import {
  supportFormCopy,
  usePartnerLocale,
} from "@/src/modules/partner-locale";
export function SupportAttachmentUpload({ ticketId }: { ticketId: string }) {
  const copy = supportFormCopy(usePartnerLocale());
  const [key, setKey] = useState(0);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(formData: FormData) {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/support/${ticketId}/attachments`, {
        method: "POST",
        body: formData,
      });
      const body = (await response.json()) as { fileName?: string };
      setMessage(
        response.ok
          ? `${copy.uploaded}${body.fileName ? ` ${body.fileName}` : ""}`
          : copy.uploadError,
      );
      if (response.ok) setKey((value) => value + 1);
    } catch {
      setMessage(copy.uploadError);
    } finally {
      setPending(false);
    }
  }
  return (
    <form action={submit} className="space-y-3">
      <label className="grid gap-1.5 text-sm font-medium">
        {copy.screenshotOrDocument}
        <input
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          className="min-h-11 rounded-md border border-zinc-300 p-2"
          key={key}
          name="file"
          required
          type="file"
        />
      </label>
      <p className="text-xs text-zinc-500">{copy.uploadHint}</p>
      <p aria-live="polite" className="text-sm text-zinc-700">
        {message}
      </p>
      <button
        className="min-h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold disabled:opacity-60"
        disabled={pending}
      >
        {pending ? copy.uploading : copy.upload}
      </button>
    </form>
  );
}
