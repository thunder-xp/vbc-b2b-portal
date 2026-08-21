"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createReservationRequestAction } from "../actions";
import { projectCopy, usePartnerLocale } from "../../partner-locale";

export function ReservationCreateForm({
  specificationId,
}: {
  specificationId: string;
}) {
  const router = useRouter();
  const copy = projectCopy(usePartnerLocale());
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await createReservationRequestAction({
            specificationId,
            requestedDeliveryDate: String(
              data.get("requestedDeliveryDate") ?? "",
            ),
            partnerComment: String(data.get("partnerComment") ?? ""),
          });
          setMessage(result.success ? copy.actionSaved : copy.actionError);
          if (result.success)
            router.push(`/cabinet/reservation-requests/${result.data.id}`);
        });
      }}
    >
      <label className="block text-sm font-medium">
        {copy.preferredDelivery}
        <input
          className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3"
          name="requestedDeliveryDate"
          required
          type="date"
        />
      </label>
      <label className="block text-sm font-medium">
        {copy.comment}
        <textarea
          className="mt-2 min-h-28 w-full rounded-md border border-zinc-300 px-3 py-2"
          maxLength={2000}
          name="partnerComment"
        />
      </label>
      <button
        className="rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? copy.creating : copy.createRequest}
      </button>
      {message ? (
        <p className="text-sm text-zinc-600" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}
