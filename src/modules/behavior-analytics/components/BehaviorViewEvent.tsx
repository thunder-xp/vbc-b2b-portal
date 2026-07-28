"use client";

import { useEffect } from "react";
import Link from "next/link";

import { recordBehaviorEventAction } from "../actions";
import type {
  BehaviorEventName,
  SafeBehaviorMetadata,
} from "../types";

const SESSION_KEY = "novotech-behavior-session";

export function BehaviorViewEvent({
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
    const storageKey = `novotech-behavior-view:${dedupeKey}`;
    if (sessionStorage.getItem(storageKey)) return;
    const sessionId = getSessionId();
    sessionStorage.setItem(storageKey, "pending");
    void recordBehaviorEventAction({
      brandId,
      categoryId,
      eventName,
      metadataSafe,
      productId,
      resultCount,
      route,
      searchQuery,
      sessionId,
      sourceSurface,
    }).then((result) => {
      if (!result.recorded) sessionStorage.removeItem(storageKey);
      else sessionStorage.setItem(storageKey, "recorded");
    });
  }, [
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
  href,
  productId,
  sourceSurface,
}: {
  children: React.ReactNode;
  className?: string;
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
          eventName: "merchandising_product_clicked",
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

function getSessionId(): string {
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, created);
  return created;
}
