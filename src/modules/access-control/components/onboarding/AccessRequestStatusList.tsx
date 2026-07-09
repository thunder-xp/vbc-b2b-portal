"use client";

import { useState, useTransition } from "react";

import { cancelOwnAccessRequestAction } from "../../actions/cancel-access-request.action";
import type { OwnAccessRequestDto } from "../../actions/get-access-requests.action";
import { AccessRequestStatus } from "../../types";

type AccessRequestStatusListProps = {
  requests: OwnAccessRequestDto[];
};

export function AccessRequestStatusList({
  requests,
}: AccessRequestStatusListProps) {
  const [items, setItems] = useState(requests);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function cancelRequest(requestId: string) {
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const result = await cancelOwnAccessRequestAction({ requestId });

      if (result.success) {
        setItems((currentItems) =>
          currentItems.map((item) =>
            item.id === result.data.id ? result.data : item,
          ),
        );
        setMessage(result.message);
        return;
      }

      setError(result.message);
    });
  }

  if (items.length === 0) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
          Access request status
        </h1>
        <p className="mt-3 text-sm text-zinc-600">
          No partner access requests were found for your account.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
        Access request status
      </h1>
      <div className="mt-5 divide-y divide-zinc-200">
        {items.map((request) => (
          <article className="py-4 first:pt-0 last:pb-0" key={request.id}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-950">
                  {request.requestedCompanyName || "Partner company request"}
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  Status: {request.status}
                </p>
                {request.requestedFiscalCode && (
                  <p className="mt-2 text-sm text-zinc-500">
                    Fiscal code / VAT / IDNO: {request.requestedFiscalCode}
                  </p>
                )}
                {request.contactPhone && (
                  <p className="mt-1 text-sm text-zinc-500">
                    Contact phone: {request.contactPhone}
                  </p>
                )}
                {request.message && (
                  <p className="mt-2 text-sm text-zinc-500">{request.message}</p>
                )}
              </div>
              {request.status === AccessRequestStatus.PendingReview && (
                <button
                  className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
                  disabled={isPending}
                  onClick={() => cancelRequest(request.id)}
                  type="button"
                >
                  Cancel
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {message && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </section>
  );
}
