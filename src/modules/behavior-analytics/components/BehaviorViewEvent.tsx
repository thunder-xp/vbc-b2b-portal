"use client";

import { useEffect } from "react";
import Link from "next/link";

import {
  recordBehaviorEventAction,
  recordBehaviorEventsAction,
} from "../actions";
import type {
  BehaviorEventName,
  SafeBehaviorMetadata,
} from "../types";

const SESSION_KEY = "novotech-behavior-session";

export function BehaviorViewEvent({
  additionalEvents = [],
  brandId,
  categoryId,
  dedupeKey,
  eventName,
  metadataSafe,
  productId,
  resultCount,
  route,
  searchQuery,
  sourceSurface,
}: {
  additionalEvents?: Array<{
    dedupeKey: string;
    eventName: BehaviorEventName;
    metadataSafe?: SafeBehaviorMetadata;
    route: string;
    sourceSurface?: string;
  }>;
  brandId?: string;
  categoryId?: string;
  dedupeKey: string;
  eventName: BehaviorEventName;
  metadataSafe?: SafeBehaviorMetadata;
  productId?: string;
  resultCount?: number;
  route: string;
  searchQuery?: string;
  sourceSurface?: string;
}) {
  useEffect(() => {
    const events = [
      { brandId, categoryId, dedupeKey, eventName, metadataSafe, productId, resultCount, route, searchQuery, sourceSurface },
      ...additionalEvents,
    ].filter((event) => !sessionStorage.getItem(`novotech-behavior-view:${event.dedupeKey}`));
    if (!events.length) return;
    const sessionId = getSessionId();
    for (const event of events) {
      sessionStorage.setItem(`novotech-behavior-view:${event.dedupeKey}`, "pending");
    }
    void recordBehaviorEventsAction(events.map((event) => {
      const input: Omit<typeof event, "dedupeKey"> & { dedupeKey?: string; sessionId: string } = {
        ...event,
        sessionId,
      };
      delete input.dedupeKey;
      return input;
    })).then((result) => {
      for (const event of events) {
        const storageKey = `novotech-behavior-view:${event.dedupeKey}`;
        if (!result.recorded) sessionStorage.removeItem(storageKey);
        else sessionStorage.setItem(storageKey, "recorded");
      }
    });
  }, [
    additionalEvents,
    brandId,
    categoryId,
    dedupeKey,
    eventName,
    metadataSafe,
    productId,
    resultCount,
    route,
    searchQuery,
    sourceSurface,
  ]);

  return null;
}

export function BehaviorTrackedLink({
  children,
  className,
  eventName = "merchandising_product_clicked",
  href,
  productId,
  sourceSurface,
}: {
  children: React.ReactNode;
  className?: string;
  eventName?: BehaviorEventName;
  href: string;
  productId: string;
  sourceSurface: string;
}) {
  return (
    <Link
      className={className}
      href={href}
      onClick={() => {
        void recordBehaviorEventAction({
          eventName,
          productId,
          route: "/cabinet/catalog",
          sessionId: getSessionId(),
          sourceSurface,
        });
      }}
      prefetch={false}
    >
      {children}
    </Link>
  );
}

export function BehaviorTrackedCatalogLink({
  ariaLabel,
  children,
  className,
  href,
  sourceSurface,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
  href: string;
  sourceSurface: string;
}) {
  return (
    <Link
      aria-label={ariaLabel}
      className={className}
      href={href}
      onClick={() => recordBehaviorInteraction({
        eventName: "merchandising_product_clicked",
        metadataSafe: { action: "show_all" },
        route: "/cabinet/catalog",
        sourceSurface,
      })}
      prefetch={false}
    >
      {children}
    </Link>
  );
}

export function recordBehaviorInteraction(input: {
  eventName: BehaviorEventName;
  metadataSafe?: SafeBehaviorMetadata;
  productId?: string;
  quantity?: number;
  route: string;
  sourceSurface: string;
}): void {
  void recordBehaviorEventAction({
    ...input,
    sessionId: getSessionId(),
  }).catch(() => undefined);
}

function getSessionId(): string {
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, created);
  return created;
}
