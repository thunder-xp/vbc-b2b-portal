"use client";

import type { ReactNode } from "react";
import {
  BehaviorViewEvent,
  recordBehaviorInteraction,
} from "../../behavior-analytics/components/BehaviorViewEvent";

/** Aggregate navigation measurement only; no per-card render writes or commercial values. */
export function OfferFeedEvidence({
  children,
  scope,
  count,
  page,
  filterUsed,
  sortUsed,
}: {
  children: ReactNode;
  scope: string;
  count: number;
  page: number;
  filterUsed: boolean;
  sortUsed: boolean;
}) {
  const additionalEvents: Parameters<
    typeof BehaviorViewEvent
  >[0]["additionalEvents"] = [];
  // The shared batch authority deduplicates by event name per navigation.
  // Keep filter/sort evidence together and pagination with the impression.
  if (filterUsed || sortUsed)
    additionalEvents.push({
      dedupeKey: `${scope}:filter`,
      eventName: "filters_applied",
      route: "/cabinet/offers",
      sourceSurface: "special_offer_feed",
      metadataSafe: { action: "controls_used", filterUsed, sortUsed },
    });
  return (
    <div
      className="min-w-0 space-y-4"
      onClickCapture={(event) => {
        const target =
          event.target instanceof Element ? event.target.closest("a") : null;
        const offer = target?.closest<HTMLElement>("[data-offer-id]");
        if (!offer) return;
        try {
          recordBehaviorInteraction({
            eventName: "merchandising_product_clicked",
            route: "/cabinet/offers",
            sourceSurface: "special_offer_feed",
            metadataSafe: {
              action: "offer_opened",
              offerId: offer.dataset.offerId ?? "",
              kind: offer.dataset.offerKind ?? "",
            },
          });
        } catch {
          /* Measurement must never block navigation. */
        }
      }}
    >
      <BehaviorViewEvent
        key={scope}
        dedupeKey={scope}
        eventName="merchandising_section_viewed"
        route="/cabinet/offers"
        sourceSurface="special_offer_feed"
        resultCount={count}
        metadataSafe={{
          action: "feed_impression",
          page,
          paginationUsed: page > 1,
        }}
        additionalEvents={additionalEvents}
      />
      {children}
    </div>
  );
}
