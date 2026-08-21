import Link from "next/link";

import {
  partnerStatusLabel,
  projectCopy,
  type PartnerLocale,
} from "../../partner-locale";
import {
  canonicalStatuses,
  StatusBadge as CanonicalStatusBadge,
} from "../../platform-ui";
import type { ProjectSpecificationDetailDto } from "../services";
import { ProjectSpecificationStatus } from "../types";
import { SpecificationForm } from "./SpecificationForm";
import {
  SpecificationItemControls,
  SubmitSpecificationButton,
} from "./SpecificationItemActions";

export function SpecificationDetail({
  specification,
  locale,
}: {
  specification: ProjectSpecificationDetailDto;
  locale: PartnerLocale;
}) {
  const copy = projectCopy(locale);
  const isDraft = specification.status === ProjectSpecificationStatus.Draft;
  const showPartnerCommercial = "partnerPurchaseTotal" in specification.totals;

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            className="text-sm font-medium text-emerald-700"
            href="/cabinet/specifications"
          >
            ← {copy.specificationsBack}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
            {specification.projectName}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {specification.customerSiteName}
          </p>
        </div>
        <StatusBadge locale={locale} status={specification.status} />
      </section>
      {specification.reviewComment ? (
        <section className="border-l-4 border-emerald-600 bg-emerald-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase text-emerald-800">
            {copy.response}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">
            {specification.reviewComment}
          </p>
          {specification.revisionId ? (
            <Link
              className="mt-3 inline-flex text-sm font-semibold text-emerald-800"
              href={`/cabinet/specifications/${specification.revisionId}`}
            >
              {copy.openRevision} →
            </Link>
          ) : null}
        </section>
      ) : null}
      {isDraft ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-4 text-base font-semibold">{copy.projectData}</h2>
          <SpecificationForm specification={specification} />
        </section>
      ) : specification.description ? (
        <p className="rounded-lg border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
          {specification.description}
        </p>
      ) : null}
      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="font-semibold">{copy.equipment}</h2>
        </div>
        {specification.lines.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">{copy.model}</th>
                  <th className="px-4 py-3">{copy.quantity}</th>
                  {showPartnerCommercial ? (
                    <th className="px-4 py-3">{copy.partnerPrice}</th>
                  ) : null}
                  <th className="px-4 py-3">{copy.retail}</th>
                  <th className="px-4 py-3">{copy.availability}</th>
                  <th className="px-4 py-3">{copy.arrival}</th>
                  <th className="px-4 py-3">{copy.total}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {specification.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-4 py-4">
                      <Link
                        className="font-semibold text-zinc-950 hover:text-emerald-700"
                        href={`/cabinet/catalog/${line.slug}`}
                      >
                        {line.productName}
                      </Link>
                      <div className="mt-1 text-xs text-zinc-500">
                        SKU {line.sku}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {isDraft ? (
                        <SpecificationItemControls
                          itemId={line.id}
                          quantity={line.quantity}
                          specificationId={specification.id}
                        />
                      ) : (
                        line.quantity
                      )}
                    </td>
                    {showPartnerCommercial ? (
                      <td className="px-4 py-4">
                        {line.partnerUnitPrice ?? copy.pending}
                      </td>
                    ) : null}
                    <td className="px-4 py-4">
                      {line.retailUnitPrice ?? copy.pending}
                    </td>
                    <td className="px-4 py-4">
                      {line.availableStock === null
                        ? copy.pending
                        : line.availableStock}
                    </td>
                    <td className="px-4 py-4">
                      {line.nearestArrivalDate ? (
                        <>
                          <div>{line.nearestArrivalDate}</div>
                          <div className="text-xs text-zinc-500">
                            {line.nearestArrivalQuantity ?? "—"} {copy.units}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {showPartnerCommercial ? (
                        <>
                          <div className="font-semibold">
                            {line.partnerLineTotal ?? "—"}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {copy.retail}: {line.retailLineTotal ?? "—"}
                          </div>
                        </>
                      ) : (
                        <div className="font-semibold">
                          {line.retailLineTotal ?? "—"}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-zinc-500">
            {copy.addEquipmentBelow}
          </p>
        )}
      </section>
      <SpecificationTotals
        copy={copy}
        showPartnerCommercial={showPartnerCommercial}
        totals={specification.totals}
      />
      {isDraft ? (
        <SubmitSpecificationButton
          disabled={!specification.lines.length}
          specificationId={specification.id}
        />
      ) : null}
    </div>
  );
}

function SpecificationTotals({
  totals,
  showPartnerCommercial,
  copy,
}: {
  totals: ProjectSpecificationDetailDto["totals"];
  showPartnerCommercial: boolean;
  copy: ReturnType<typeof projectCopy>;
}) {
  const values = showPartnerCommercial
    ? [
        [copy.partnerPurchase, totals.partnerPurchaseTotal],
        [copy.retailTotal, totals.retailTotal],
        [copy.grossProfit, totals.potentialGrossProfit],
        [copy.markup, totals.markupPercentage],
      ]
    : [[copy.retailTotal, totals.retailTotal]];
  return (
    <section className="grid gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-2 xl:grid-cols-4">
      {values.map(([label, value]) => (
        <div className="bg-white p-5" key={label}>
          <p className="text-xs font-medium uppercase text-zinc-500">{label}</p>
          <p className="mt-2 text-xl font-semibold text-zinc-950">
            {value ?? copy.unavailable}
          </p>
        </div>
      ))}
    </section>
  );
}

export function StatusBadge({
  status,
  locale = "ru",
}: {
  status: ProjectSpecificationStatus;
  locale?: PartnerLocale;
}) {
  const descriptor =
    status === ProjectSpecificationStatus.Draft
      ? canonicalStatuses.draft
      : status === ProjectSpecificationStatus.Submitted
        ? canonicalStatuses.submitted
        : status === ProjectSpecificationStatus.UnderReview
          ? canonicalStatuses.underReview
          : status === ProjectSpecificationStatus.Approved
            ? canonicalStatuses.approved
            : status === ProjectSpecificationStatus.ChangesRequested
              ? canonicalStatuses.changesRequested
              : canonicalStatuses.rejected;
  return (
    <CanonicalStatusBadge
      label={partnerStatusLabel(locale, "project", status)}
      status={descriptor}
    />
  );
}
