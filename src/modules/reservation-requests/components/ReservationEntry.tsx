import Link from "next/link";

import type { ReservationEntryDto } from "../services";
import { projectCopy } from "../../partner-locale";
import { getPartnerLocale } from "../../partner-locale/server";

export async function ReservationEntry({
  entry,
}: {
  entry: ReservationEntryDto;
}) {
  const copy = projectCopy(await getPartnerLocale());
  if (entry.existingRequestId) {
    return (
      <Link
        className="inline-flex rounded-md border border-emerald-700 px-4 py-2.5 text-sm font-semibold text-emerald-800"
        href={`/cabinet/reservation-requests/${entry.existingRequestId}`}
      >
        {copy.openReservation}
      </Link>
    );
  }
  if (!entry.approved) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {entry.latestRequestId ? (
        <Link
          className="inline-flex rounded-md border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-800"
          href={`/cabinet/reservation-requests/${entry.latestRequestId}`}
        >
          {copy.latestDecision}
        </Link>
      ) : null}
      <Link
        className="inline-flex rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"
        href={`/cabinet/reservation-requests/new?specificationId=${entry.specificationId}`}
      >
        {copy.requestReservation}
      </Link>
    </div>
  );
}
