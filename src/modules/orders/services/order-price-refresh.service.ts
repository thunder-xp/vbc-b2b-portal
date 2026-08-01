import "server-only";

import { createHash } from "node:crypto";

import type { PricingProvider } from "../../integration/contracts";
import type { OrderPriceRefreshRepository } from "../repositories";

const LEASE_TTL_SECONDS = 15;
const REFRESH_WAIT_MS = 12_000;
const POLL_INTERVAL_MS = 150;

export type OrderPriceRefreshResult = {
  verifiedAt: string;
  productCount: number;
  providerRequestCount: number;
  deduplicated: boolean;
  durationMs: number;
};

export interface OrderPriceRefreshService {
  refresh(input: {
    externalPriceTypeRef: string;
    externalProductRefs: string[];
  }): Promise<OrderPriceRefreshResult>;
}

export class OrderPriceRefreshFailedError extends Error {
  constructor(readonly correlationId = crypto.randomUUID(), options?: ErrorOptions) {
    super("Authoritative order prices could not be refreshed.", options);
    this.name = "OrderPriceRefreshFailedError";
  }
}

export class OrderPriceDataMissingError extends Error {
  constructor(readonly correlationId = crypto.randomUUID()) {
    super("The authoritative price response is incomplete.");
    this.name = "OrderPriceDataMissingError";
  }
}

export class DefaultOrderPriceRefreshService implements OrderPriceRefreshService {
  constructor(
    private readonly provider: PricingProvider,
    private readonly repository: OrderPriceRefreshRepository,
    private readonly now: () => number = Date.now,
    private readonly wait: (milliseconds: number) => Promise<void> = sleep,
  ) {}

  async refresh(input: {
    externalPriceTypeRef: string;
    externalProductRefs: string[];
  }): Promise<OrderPriceRefreshResult> {
    const startedAt = this.now();
    const verifiedSince = new Date(startedAt).toISOString();
    const productRefs = [...new Set(input.externalProductRefs.map((value) => value.trim().toLowerCase()))].sort();
    if (!this.provider.fetchCurrentProductPrices || productRefs.length === 0) {
      throw new OrderPriceRefreshFailedError();
    }
    const fingerprint = createHash("sha256")
      .update(`${input.externalPriceTypeRef.toLowerCase()}|${productRefs.join("|")}`)
      .digest("hex");
    const ownerToken = crypto.randomUUID();
    const deadline = startedAt + REFRESH_WAIT_MS;

    while (this.now() < deadline) {
      let acquired = false;
      try {
        acquired = await this.repository.claimLease({
          fingerprint,
          ownerToken,
          ttlSeconds: LEASE_TTL_SECONDS,
        });
        if (!acquired) {
          if (await this.repository.hasVerifiedPricesSince({
            externalPriceTypeRef: input.externalPriceTypeRef,
            externalProductRefs: productRefs,
            verifiedSince,
          })) {
            return result(verifiedSince, productRefs.length, 0, true, this.now() - startedAt);
          }
          await this.wait(POLL_INTERVAL_MS);
          continue;
        }

        const prices = await this.provider.fetchCurrentProductPrices({
          priceTypeReference: reference(input.externalPriceTypeRef, "price-type"),
          productReferences: productRefs.map((value) => reference(value, "catalog-product")),
        });
        const byProductRef = new Map(prices.map((price) => [price.productReference.externalId.toLowerCase(), price]));
        if (byProductRef.size !== productRefs.length || productRefs.some((value) => {
          const price = byProductRef.get(value);
          return !price || !price.isActive || !Number.isFinite(price.amount) || price.amount <= 0;
        })) {
          throw new OrderPriceDataMissingError();
        }
        const verifiedAt = new Date(this.now()).toISOString();
        const published = await this.repository.publishVerifiedPrices({
          externalPriceTypeRef: input.externalPriceTypeRef,
          verifiedAt,
          rows: productRefs.map((externalProductRef) => {
            const price = byProductRef.get(externalProductRef)!;
            return {
              externalProductRef,
              amount: price.amount,
              effectiveAt: price.effectiveAt,
              isActive: price.isActive,
            };
          }),
        });
        if (published !== productRefs.length) throw new OrderPriceDataMissingError();
        return result(verifiedAt, productRefs.length, 1, false, this.now() - startedAt);
      } catch (error) {
        if (error instanceof OrderPriceDataMissingError) throw error;
        throw new OrderPriceRefreshFailedError(crypto.randomUUID(), { cause: error });
      } finally {
        if (acquired) {
          try { await this.repository.releaseLease(fingerprint, ownerToken); }
          catch (error) {
            console.error({
              event: "order_price_refresh_lease_release_failed",
              errorType: error instanceof Error ? error.name : typeof error,
            });
          }
        }
      }
    }

    throw new OrderPriceRefreshFailedError();
  }
}

function reference(externalId: string, externalType: string) {
  return { providerCode: "one-c", externalId, externalType };
}

function result(
  verifiedAt: string,
  productCount: number,
  providerRequestCount: number,
  deduplicated: boolean,
  durationMs: number,
): OrderPriceRefreshResult {
  return { verifiedAt, productCount, providerRequestCount, deduplicated, durationMs };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
