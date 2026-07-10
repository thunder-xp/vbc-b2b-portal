"use client";

import { type FormEvent, useState, useTransition } from "react";

import {
  approveAccessRequestAction,
  rejectAccessRequestAction,
} from "../../actions/admin/access-approval.actions";

type AccessRequestDecisionFormsProps = {
  requestId: string;
};

export function AccessRequestDecisionForms({
  requestId,
}: AccessRequestDecisionFormsProps) {
  const [external1cId, setExternal1cId] = useState("");
  const [external1cContractId, setExternal1cContractId] = useState("");
  const [external1cPriceTypeId, setExternal1cPriceTypeId] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setError(null);

    startTransition(async () => {
      const result = await approveAccessRequestAction({
        requestId,
        external1cId,
        external1cContractId,
        external1cPriceTypeId,
        decisionReason,
      });

      if (result.success) {
        setNotice(result.message);
        return;
      }

      setError(result.message);
    });
  }

  function reject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setError(null);

    startTransition(async () => {
      const result = await rejectAccessRequestAction({
        requestId,
        reason: rejectReason,
      });

      if (result.success) {
        setNotice(result.message);
        return;
      }

      setError(result.message);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
        onSubmit={approve}
      >
        <h2 className="text-lg font-semibold text-zinc-950">Approve access</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Bind the request to validated 1C references. Partners cannot see or
          edit these fields.
        </p>
        <div className="mt-5 grid gap-4">
          <Input
            label="1C partner reference"
            onChange={setExternal1cId}
            value={external1cId}
          />
          <Input
            label="1C contract reference"
            onChange={setExternal1cContractId}
            value={external1cContractId}
          />
          <Input
            label="Price type / price group reference"
            onChange={setExternal1cPriceTypeId}
            value={external1cPriceTypeId}
          />
          <label className="grid gap-2 text-sm font-medium text-zinc-800">
            Approval note
            <textarea
              className="min-h-24 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-950"
              onChange={(event) => setDecisionReason(event.target.value)}
              value={decisionReason}
            />
          </label>
        </div>
        <button
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          disabled={isPending}
          type="submit"
        >
          Approve
        </button>
      </form>

      <form
        className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
        onSubmit={reject}
      >
        <h2 className="text-lg font-semibold text-zinc-950">Reject request</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Rejecting does not create a company or membership.
        </p>
        <label className="mt-5 grid gap-2 text-sm font-medium text-zinc-800">
          Rejection reason
          <textarea
            className="min-h-32 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-950"
            onChange={(event) => setRejectReason(event.target.value)}
            value={rejectReason}
          />
        </label>
        <button
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md border border-red-300 px-4 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-zinc-400"
          disabled={isPending}
          type="submit"
        >
          Reject
        </button>
      </form>

      {(notice || error) && (
        <div className="lg:col-span-2">
          {notice && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {notice}
            </p>
          )}
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Input({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-zinc-800">
      {label}
      <input
        className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}
