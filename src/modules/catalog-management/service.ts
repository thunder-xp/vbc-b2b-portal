import "server-only";

import { createHash } from "node:crypto";

import sharp, { type Metadata } from "sharp";

import { getOneCEnv } from "@/src/lib/env";
import { SupabasePublicRetailPublicationRepository } from "@/src/modules/public-retail/repositories/supabase/public-retail-publication.supabase-repository";
import { PublicRetailPublicationService } from "@/src/modules/public-retail/services/public-retail-publication.service";
import {
  FirebaseProductImageStorage,
  FirebaseProductImageStorageError,
  managedFirebaseObjectPathFromUrl,
} from "./firebase-product-image-storage";
import {
  OneCProductImageGateway,
  OneCProductImageGatewayError,
  PRODUCT_IMAGE_PROPERTY_KEY,
  withProductImageUrl,
} from "./one-c-product-image-gateway";
import {
  CatalogManagementRepository,
  CatalogManagementRepositoryError,
} from "./repository";
import type {
  CatalogImageUploadResult,
  CatalogManagementFilter,
  CatalogManagementPage,
  CatalogVisibilityResult,
} from "./types";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const MIN_DIMENSION = 300;
const MAX_DIMENSION = 10_000;
const FORMATS = {
  jpeg: { mime: "image/jpeg", extension: "jpg" },
  png: { mime: "image/png", extension: "png" },
  webp: { mime: "image/webp", extension: "webp" },
} as const;

export type ValidatedProductImage = {
  bytes: Buffer;
  contentType: string;
  extension: "jpg" | "png" | "webp";
  width: number;
  height: number;
  contentHash: string;
};

export class CatalogManagementValidationError extends Error {
  constructor(readonly safeCode: string) {
    super(safeCode);
    this.name = "CatalogManagementValidationError";
  }
}

export class CatalogImageMutationError extends Error {
  constructor(
    readonly safeCode: string,
    readonly stage: string,
    readonly correlationId: string,
    readonly cleanupStatus: string,
  ) {
    super(safeCode);
    this.name = "CatalogImageMutationError";
  }
}

export class CatalogManagementService {
  constructor(
    private readonly repository = new CatalogManagementRepository(),
    private readonly storage = new FirebaseProductImageStorage(),
    private readonly oneC = new OneCProductImageGateway(getOneCEnv()),
    private readonly publicRetailPublisher = new PublicRetailPublicationService(
      new SupabasePublicRetailPublicationRepository(),
    ),
  ) {}

  list(input: {
    filter?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<CatalogManagementPage> {
    return this.repository.list({
      filter: parseFilter(input.filter),
      search: input.search?.trim().slice(0, 100) || undefined,
      page: positiveInteger(input.page, 1),
      pageSize: Math.min(positiveInteger(input.pageSize, 25), 50),
    });
  }

  async setVisibility(input: {
    productId: string;
    visible: boolean;
    reason: string;
    correlationId: string;
  }): Promise<CatalogVisibilityResult> {
    if (!isUuid(input.productId) || !isUuid(input.correlationId)
      || input.reason.trim().length < 3 || input.reason.trim().length > 500) {
      throw new CatalogManagementValidationError("CATALOG_VISIBILITY_INPUT_INVALID");
    }
    const result = await this.repository.setVisibility({ ...input, reason: input.reason.trim() });
    await publishPublicRetailProjection(this.publicRetailPublisher);
    return result;
  }

  async uploadProductImage(input: {
    productId: string;
    actorUserId: string;
    correlationId: string;
    file: File;
  }): Promise<CatalogImageUploadResult> {
    if (!isUuid(input.productId) || !isUuid(input.actorUserId) || !isUuid(input.correlationId)) {
      throw new CatalogImageMutationError("CATALOG_IMAGE_INPUT_INVALID", "validation", input.correlationId, "NOT_REQUIRED");
    }
    const product = await this.repository.getProductForImageMutation(input.productId);
    if (!product) {
      throw new CatalogImageMutationError("CATALOG_PRODUCT_NOT_FOUND", "product_lookup", input.correlationId, "NOT_REQUIRED");
    }
    await this.repository.startImageMutation({ correlationId: input.correlationId, product, actorUserId: input.actorUserId });

    let stored: { canonicalUrl: string; objectPath: string } | null = null;
    let oneCConfirmed = false;
    let previousCanonicalUrl: string | null = null;
    let stage = "validation";
    try {
      const image = await validateProductImage(input.file);
      stage = "firebase_access";
      await this.storage.verifyAccess();
      stage = "firebase_upload";
      stored = await this.storage.upload({
        objectPath: `products/${product.external1cId.toLowerCase()}/${image.contentHash}.${image.extension}`,
        bytes: image.bytes,
        contentType: image.contentType,
      });
      await this.repository.updateImageMutation({
        correlationId: input.correlationId,
        status: "firebase_stored",
        stage,
        newUrl: stored.canonicalUrl,
        objectPath: stored.objectPath,
      });
      await this.repository.appendImageAudit({
        correlationId: input.correlationId,
        product,
        actorUserId: input.actorUserId,
        eventType: "CATALOG_IMAGE_FIREBASE_STORED",
        stage,
        oldUrl: product.imageOriginalUrl,
        newUrl: stored.canonicalUrl,
        safeMetadata: { width: image.width, height: image.height, bytes: image.bytes.byteLength },
      });

      stage = "one_c_read";
      const before = await this.oneC.read(product.external1cId);
      previousCanonicalUrl = before.imageUrl;
      const unrelatedBefore = unrelatedRequisitesProof(before.requisites);
      stage = "one_c_patch";
      await this.oneC.write(product.external1cId, withProductImageUrl(before.requisites, stored.canonicalUrl));
      stage = "one_c_readback";
      const readBack = await this.oneC.read(product.external1cId);
      if (readBack.imageUrl !== stored.canonicalUrl) {
        throw new OneCProductImageGatewayError("ONEC_IMAGE_READBACK_MISMATCH");
      }
      oneCConfirmed = true;
      const unrelatedAfter = unrelatedRequisitesProof(readBack.requisites);
      if (unrelatedAfter.sha256 !== unrelatedBefore.sha256
        || unrelatedAfter.count !== unrelatedBefore.count) {
        throw new OneCProductImageGatewayError("ONEC_UNRELATED_REQUISITES_CHANGED");
      }
      await this.repository.updateImageMutation({
        correlationId: input.correlationId,
        status: "one_c_confirmed",
        stage,
      });
      await this.repository.appendImageAudit({
        correlationId: input.correlationId,
        product,
        actorUserId: input.actorUserId,
        eventType: "CATALOG_IMAGE_1C_WRITE_CONFIRMED",
        stage,
        oldUrl: previousCanonicalUrl,
        newUrl: stored.canonicalUrl,
        safeMetadata: {
          unrelatedRequisiteCount: unrelatedAfter.count,
          unrelatedRequisitesSha256: unrelatedAfter.sha256,
          unrelatedRequisitesUnchanged: true,
        },
      });

      stage = "targeted_local_refresh";
      await this.repository.publishTargetedImage(product.id, stored.canonicalUrl);
      if (!await this.repository.verifyTargetedImage(product.id, stored.canonicalUrl)) {
        throw new CatalogManagementRepositoryError("CATALOG_TARGETED_REFRESH_MISMATCH");
      }
      stage = "public_retail_projection";
      await publishPublicRetailProjection(this.publicRetailPublisher);

      let cleanupStatus = "NOT_REQUIRED";
      const previousObjectPath = managedFirebaseObjectPathFromUrl(previousCanonicalUrl);
      if (previousObjectPath && previousObjectPath !== stored.objectPath) {
        stage = "replacement_cleanup";
        const references = await this.repository.countCanonicalImageReferences(previousCanonicalUrl!, product.id);
        if (references === 0) {
          try {
            await this.storage.deleteManagedObject(previousObjectPath);
            cleanupStatus = "COMPLETED";
          } catch {
            cleanupStatus = "PENDING";
          }
        }
      } else if (previousCanonicalUrl && !previousObjectPath) {
        cleanupStatus = "SKIPPED_UNMANAGED";
      }

      const replaced = previousCanonicalUrl !== null && previousCanonicalUrl !== stored.canonicalUrl;
      await this.repository.updateImageMutation({
        correlationId: input.correlationId,
        status: "succeeded",
        stage: "completed",
        cleanupStatus,
        completed: true,
      });
      if (replaced) {
        await this.repository.appendImageAudit({
          correlationId: input.correlationId,
          product,
          actorUserId: input.actorUserId,
          eventType: "CATALOG_IMAGE_REPLACED",
          stage: "completed",
          oldUrl: previousCanonicalUrl,
          newUrl: stored.canonicalUrl,
          cleanupStatus,
        });
      }
      await this.repository.recoverPriorFailures(product.id, input.correlationId);
      return {
        productId: product.id,
        imageUrl: stored.canonicalUrl,
        correlationId: input.correlationId,
        replaced,
        cleanupStatus,
      };
    } catch (error) {
      const safeCode = safeErrorCode(error);
      let cleanupStatus = "NOT_REQUIRED";
      if (stored && !oneCConfirmed) {
        try {
          await this.storage.deleteManagedObject(stored.objectPath);
          cleanupStatus = "COMPLETED";
        } catch {
          cleanupStatus = "PENDING";
        }
      }
      const status = oneCConfirmed ? "refresh_pending" : "failed";
      try {
        await this.repository.updateImageMutation({
          correlationId: input.correlationId,
          status,
          stage,
          newUrl: stored?.canonicalUrl,
          objectPath: stored?.objectPath,
          safeErrorCode: safeCode,
          cleanupStatus,
          completed: !oneCConfirmed,
        });
        await this.repository.appendImageAudit({
          correlationId: input.correlationId,
          product,
          actorUserId: input.actorUserId,
          eventType: "CATALOG_IMAGE_UPLOAD_FAILED",
          stage,
          oldUrl: previousCanonicalUrl ?? product.imageOriginalUrl,
          newUrl: stored?.canonicalUrl,
          safeErrorCode: safeCode,
          cleanupStatus,
        });
      } catch {
        // The original typed integration failure remains authoritative.
      }
      throw new CatalogImageMutationError(safeCode, stage, input.correlationId, cleanupStatus);
    }
  }
}

async function publishPublicRetailProjection(publisher: {
  publishCurrentProjection(): Promise<unknown>;
}): Promise<void> {
  try {
    await publisher.publishCurrentProjection();
  } catch {
    // Candidate builds are bounded and occasionally hit a transient statement timeout;
    // one immediate clean candidate retry preserves the existing atomic publication contract.
    await publisher.publishCurrentProjection();
  }
}

function unrelatedRequisitesProof(requisites: ReadonlyArray<Record<string, unknown>>): {
  count: number;
  sha256: string;
} {
  const unrelated = requisites
    .filter((requisite) => requisite["Свойство_Key"] !== PRODUCT_IMAGE_PROPERTY_KEY)
    .map(stableJsonValue)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return {
    count: unrelated.length,
    sha256: createHash("sha256").update(JSON.stringify(unrelated)).digest("hex"),
  };
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableJsonValue(nested)]),
  );
}

export async function validateProductImage(file: File): Promise<ValidatedProductImage> {
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    throw new CatalogManagementValidationError("CATALOG_IMAGE_SIZE_INVALID");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  let metadata: Metadata;
  try {
    metadata = await sharp(bytes, { failOn: "warning", limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
  } catch {
    throw new CatalogManagementValidationError("CATALOG_IMAGE_CORRUPTED");
  }
  const format = metadata.format && metadata.format in FORMATS
    ? FORMATS[metadata.format as keyof typeof FORMATS]
    : null;
  if (!format || file.type !== format.mime) {
    throw new CatalogManagementValidationError("CATALOG_IMAGE_TYPE_INVALID");
  }
  if (!metadata.width || !metadata.height
    || metadata.width < MIN_DIMENSION || metadata.height < MIN_DIMENSION
    || metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
    throw new CatalogManagementValidationError("CATALOG_IMAGE_DIMENSIONS_INVALID");
  }
  return {
    bytes,
    contentType: format.mime,
    extension: format.extension,
    width: metadata.width,
    height: metadata.height,
    contentHash: createHash("sha256").update(bytes).digest("hex"),
  };
}

function parseFilter(value: string | undefined): CatalogManagementFilter {
  const normalized = value?.trim().toUpperCase() ?? "ALL";
  const filters: CatalogManagementFilter[] = [
    "ALL", "PUBLISHED", "HIDDEN", "MISSING_IMAGE", "MISSING_CATEGORY",
    "MISSING_BRAND", "MISSING_PRICE", "STOCK_UNKNOWN", "NEEDS_ATTENTION",
    "HIDDEN_BY_PORTAL", "INACTIVE_IN_1C",
  ];
  return filters.includes(normalized as CatalogManagementFilter)
    ? normalized as CatalogManagementFilter
    : "ALL";
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function safeErrorCode(error: unknown): string {
  if (error instanceof CatalogManagementValidationError
    || error instanceof FirebaseProductImageStorageError
    || error instanceof OneCProductImageGatewayError
    || error instanceof CatalogManagementRepositoryError) {
    return error.safeCode.slice(0, 80);
  }
  return "CATALOG_IMAGE_UNKNOWN_FAILURE";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
