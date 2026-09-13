import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FIREBASE_PRODUCT_IMAGE_BUCKET,
  inspectFirebaseProductImageStorageConfiguration,
  managedFirebaseObjectPathFromUrl,
} from "../firebase-product-image-storage";

describe("Firebase product image storage boundary", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("requires a dedicated server credential and the exact historical bucket", () => {
    vi.stubEnv("FIREBASE_PRODUCT_IMAGES_CLIENT_EMAIL", "b2b-images@example.iam.gserviceaccount.com");
    vi.stubEnv("FIREBASE_PRODUCT_IMAGES_PRIVATE_KEY", "private");
    vi.stubEnv("FIREBASE_PRODUCT_IMAGES_BUCKET", FIREBASE_PRODUCT_IMAGE_BUCKET);
    expect(inspectFirebaseProductImageStorageConfiguration()).toMatchObject({
      configured: true,
      bucket: "novotech-systems-5449b.appspot.com",
      credentialModel: "dedicated_service_account",
    });
  });

  it("recognizes only deterministic managed Firebase objects", () => {
    const ref = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const hash = "b".repeat(64);
    const path = `products/${ref}/${hash}.webp`;
    expect(managedFirebaseObjectPathFromUrl(`https://firebasestorage.googleapis.com/v0/b/${FIREBASE_PRODUCT_IMAGE_BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=x`)).toBe(path);
    expect(managedFirebaseObjectPathFromUrl("https://example.com/product.jpg")).toBeNull();
    expect(managedFirebaseObjectPathFromUrl(`https://firebasestorage.googleapis.com/v0/b/other.appspot.com/o/${encodeURIComponent(path)}`)).toBeNull();
  });
});
