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
  sortMode = "recommended",
  route = "/cabinet/offers",
  sourceSurface = "special_offer_feed",
  trackImpression = true,
}: {
  children: ReactNode;
  scope: string;
  count: number;
  page: number;
  filterUsed: boolean;
  sortUsed: boolean;
  sortMode?: import("../offer-feed").OfferFeedSort;
  route?: "/cabinet/offers" | "/cabinet/catalog";
  sourceSurface?: string;
  trackImpression?: boolean;
}) {
  const additionalEvents: Parameters<
    typeof BehaviorViewEvent
  >[0]["additionalEvents"] = [];
  // The shared batch authority deduplicates by event name per navigation.
  // Keep filter/sort evidence together and pagination with the impression.
  if (trackImpression && (filterUsed || sortUsed))
    additionalEvents.push({
      dedupeKey: `${scope}:filter`,
      eventName: "filters_applied",
      route,
      sourceSurface,
      metadataSafe: { action: "controls_used", filterUsed, sortUsed, sortMode },
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
            route,
            sourceSurface,
            metadataSafe: {
              action: "offer_opened",
              offerId: offer.dataset.offerId ?? "",
              kind: offer.dataset.offerKind ?? "",
              offerType: offer.dataset.offerKind ?? "",
              campaignId: offer.dataset.campaignId ?? "",
              rankPosition: Number(offer.dataset.rankPosition) || null,
              sortMode,
            },
          });
        } catch {
          /* Measurement must never block navigation. */
        }
      }}
    >
      {trackImpression ? (
        <BehaviorViewEvent
          key={scope}
          dedupeKey={scope}
          eventName="merchandising_section_viewed"
          route={route}
          sourceSurface={sourceSurface}
          resultCount={count}
          metadataSafe={{
            action: "feed_impression",
            page,
            paginationUsed: page > 1,
            sortMode,
          }}
          additionalEvents={additionalEvents}
        />
      ) : null}
      {children}
    </div>
  );
}
