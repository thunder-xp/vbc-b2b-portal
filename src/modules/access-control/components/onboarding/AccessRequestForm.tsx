"use client";

import { type FormEvent, useState, useTransition } from "react";

import { submitAccessRequestAction } from "../../actions/submit-access-request.action";

export function AccessRequestForm() {
  const [requestedCompanyName, setRequestedCompanyName] = useState("");
  const [requestedFiscalCode, setRequestedFiscalCode] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setError(null);

    startTransition(async () => {
      const result = await submitAccessRequestAction({
        requestedCompanyName,
        requestedFiscalCode,
        contactPhone,
        message,
      });

      if (result.success) {
        setNotice(result.message);
        setRequestedCompanyName("");
        setRequestedFiscalCode("");
        setContactPhone("");
        setMessage("");
        return;
      }

      setError(result.message);
    });
  }

  return (
    <form
      className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
      onSubmit={handleSubmit}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
          Partner access request
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Send a request for Novotech manager review.
        </p>
      </div>

      <div className="mt-6 grid gap-5">
        <label className="grid gap-2 text-sm font-medium text-zinc-800">
          Partner company name
          <input
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
            name="requestedCompanyName"
            onChange={(event) => setRequestedCompanyName(event.target.value)}
            value={requestedCompanyName}
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-zinc-800">
          Fiscal code / VAT / IDNO
          <input
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
            name="requestedFiscalCode"
            onChange={(event) => setRequestedFiscalCode(event.target.value)}
            value={requestedFiscalCode}
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-zinc-800">
          Contact phone
          <input
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
            name="contactPhone"
            onChange={(event) => setContactPhone(event.target.value)}
            value={contactPhone}
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-zinc-800">
          Message / comment
          <textarea
            className="min-h-28 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-950"
            name="message"
            onChange={(event) => setMessage(event.target.value)}
            value={message}
          />
        </label>
      </div>

      {notice && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <button
        className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Submitting..." : "Submit request"}
      </button>
    </form>
  );
}
