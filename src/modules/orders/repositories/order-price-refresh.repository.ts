export type TargetedPriceRefreshRow = {
  externalProductRef: string;
  amount: number;
  effectiveAt: string;
  isActive: boolean;
};

export interface OrderPriceRefreshRepository {
  claimLease(input: {
    fingerprint: string;
    ownerToken: string;
    ttlSeconds: number;
  }): Promise<boolean>;
  releaseLease(fingerprint: string, ownerToken: string): Promise<void>;
  hasVerifiedPricesSince(input: {
    externalPriceTypeRef: string;
    externalProductRefs: string[];
    verifiedSince: string;
  }): Promise<boolean>;
  publishVerifiedPrices(input: {
    externalPriceTypeRef: string;
    rows: TargetedPriceRefreshRow[];
    verifiedAt: string;
  }): Promise<number>;
}
