import "server-only";

import { createHash, randomUUID } from "node:crypto";

import sharp from "sharp";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { normalizeProductImageUrl } from "../components/product-image-source";

const BUCKET = "catalog-normalized-images";
const CANVAS_SIZE = 512;
const SUBJECT_SIZE = 389;
const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_INPUT_PIXELS = 20_000_000;
const FETCH_TIMEOUT_MS = 5_000;
const WORKER_CONCURRENCY = 4;

export type ImageNormalizationResult =
  | { status: "normalized"; bytes: Buffer; metadata: Record<string, number> }
  | { status: "review_needed"; reason: string; metadata: Record<string, number> };

type ClaimedJob = {
  productId: string;
  sourceUrl: string;
  attempt: number;
  previousStorageKey: string | null;
};

export async function normalizeCatalogProductImage(input: Buffer): Promise<ImageNormalizationResult> {
  if (input.byteLength === 0 || input.byteLength > MAX_INPUT_BYTES) {
    return { status: "review_needed", reason: "input_size_out_of_bounds", metadata: { inputBytes: input.byteLength } };
  }

  const source = sharp(input, { failOn: "warning", limitInputPixels: MAX_INPUT_PIXELS }).rotate().ensureAlpha();
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height || !["jpeg", "png", "webp"].includes(metadata.format ?? "")) {
    return { status: "review_needed", reason: "unsupported_image", metadata: { inputBytes: input.byteLength } };
  }

  const raw = await source.raw().toBuffer({ resolveWithObject: true });
  const bounds = detectSubjectBounds(raw.data, raw.info.width, raw.info.height, raw.info.channels);
  const diagnostics = {
    inputBytes: input.byteLength,
    sourceWidth: raw.info.width,
    sourceHeight: raw.info.height,
    borderBackgroundPermille: Math.round(bounds.borderBackgroundRatio * 1000),
    sourceOccupancyPermille: Math.round(bounds.occupancy * 1000),
  };
  if (!bounds.confident) {
    return { status: "review_needed", reason: bounds.reason, metadata: diagnostics };
  }

  const padding = Math.max(2, Math.round(Math.max(bounds.width, bounds.height) * 0.035));
  const left = Math.max(0, bounds.left - padding);
  const top = Math.max(0, bounds.top - padding);
  const width = Math.min(raw.info.width - left, bounds.width + padding * 2);
  const height = Math.min(raw.info.height - top, bounds.height + padding * 2);
  const scale = Math.min(SUBJECT_SIZE / width, SUBJECT_SIZE / height);
  const resizedWidth = Math.round(width * scale);
  const resizedHeight = Math.round(height * scale);
  const output = await sharp(input, { failOn: "warning", limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .extract({ left, top, width, height })
    .resize(SUBJECT_SIZE, SUBJECT_SIZE, { fit: "inside", withoutEnlargement: false })
    .extend({
      top: Math.floor((CANVAS_SIZE - resizedHeight) / 2),
      bottom: Math.ceil((CANVAS_SIZE - resizedHeight) / 2),
      left: Math.floor((CANVAS_SIZE - resizedWidth) / 2),
      right: Math.ceil((CANVAS_SIZE - resizedWidth) / 2),
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();

  return { status: "normalized", bytes: output, metadata: { ...diagnostics, outputBytes: output.byteLength, outputSize: CANVAS_SIZE } };
}

export async function processCatalogProductImageNormalizationBatch(batchSize = 12) {
  const admin = createAdminClient();
  const claimToken = randomUUID();
  const startedAt = performance.now();
  const { data, error } = await admin.rpc("claim_catalog_product_image_normalization_jobs", {
    p_batch_size: Math.min(20, Math.max(1, batchSize)),
    p_claim_token: claimToken,
  });
  if (error) throw new Error(`IMAGE_NORMALIZATION_CLAIM_${error.code ?? "FAILED"}`);
  const jobs = Array.isArray(data) ? data as ClaimedJob[] : [];
  const results: Array<{ status: string }> = [];

  for (let index = 0; index < jobs.length; index += WORKER_CONCURRENCY) {
    results.push(...await Promise.all(jobs.slice(index, index + WORKER_CONCURRENCY).map((job) => processJob(job, claimToken))));
  }

  return {
    claimed: jobs.length,
    normalized: results.filter((result) => result.status === "succeeded").length,
    reviewNeeded: results.filter((result) => result.status === "review_needed").length,
    failed: results.filter((result) => result.status === "failed").length,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

async function processJob(job: ClaimedJob, claimToken: string): Promise<{ status: string }> {
  const admin = createAdminClient();
  const sourceUrl = normalizeProductImageUrl(job.sourceUrl);
  if (!sourceUrl || !sourceUrl.startsWith("https://")) {
    await complete(admin, job, claimToken, "review_needed", null, null, {}, "unsafe_source_url", null);
    return { status: "review_needed" };
  }

  try {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
    const declaredSize = Number(response.headers.get("content-length") ?? 0);
    if (!response.ok || declaredSize > MAX_INPUT_BYTES) throw new Error(response.ok ? "INPUT_TOO_LARGE" : `HTTP_${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const result = await normalizeCatalogProductImage(bytes);
    if (result.status === "review_needed") {
      await complete(admin, job, claimToken, "review_needed", null, null, result.metadata, result.reason, null);
      return { status: "review_needed" };
    }

    const sourceHash = createHash("sha256").update(job.sourceUrl).digest("hex").slice(0, 24);
    const storageKey = `${job.productId}/${sourceHash}.webp`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(storageKey, result.bytes, {
      contentType: "image/webp", cacheControl: "31536000", upsert: true,
    });
    if (uploadError) throw new Error(`UPLOAD_${uploadError.name}`);
    const publicUrl = admin.storage.from(BUCKET).getPublicUrl(storageKey).data.publicUrl;
    await complete(admin, job, claimToken, "succeeded", storageKey, publicUrl, result.metadata, null, null);
    if (job.previousStorageKey && job.previousStorageKey !== storageKey) {
      await admin.storage.from(BUCKET).remove([job.previousStorageKey]);
    }
    return { status: "succeeded" };
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 80) : "UNKNOWN";
    await complete(admin, job, claimToken, "failed", null, null, {}, null, code);
    return { status: "failed" };
  }
}

async function complete(
  admin: ReturnType<typeof createAdminClient>, job: ClaimedJob, claimToken: string,
  status: "succeeded" | "review_needed" | "failed", storageKey: string | null,
  publicUrl: string | null, metadata: Record<string, number>, reason: string | null, errorCode: string | null,
) {
  const { error } = await admin.rpc("complete_catalog_product_image_normalization_job", {
    p_product_id: job.productId, p_claim_token: claimToken, p_source_url: job.sourceUrl,
    p_status: status, p_storage_key: storageKey, p_public_url: publicUrl,
    p_metadata: metadata, p_safe_reason: reason, p_error_code: errorCode,
  });
  if (error) throw new Error(`IMAGE_NORMALIZATION_COMPLETE_${error.code ?? "FAILED"}`);
}

function detectSubjectBounds(data: Buffer, width: number, height: number, channels: number) {
  const size = width * height;
  const background = new Uint8Array(size);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  let borderSamples = 0;
  let borderBackground = 0;
  const isBackground = (index: number) => {
    const offset = index * channels;
    const alpha = channels > 3 ? data[offset + 3]! : 255;
    if (alpha <= 16) return true;
    const red = data[offset]!;
    const green = data[offset + 1]!;
    const blue = data[offset + 2]!;
    return red >= 246 && green >= 246 && blue >= 246 && Math.max(red, green, blue) - Math.min(red, green, blue) <= 8;
  };
  const enqueue = (index: number) => {
    borderSamples += 1;
    if (!background[index] && isBackground(index)) {
      background[index] = 1;
      queue[tail++] = index;
      borderBackground += 1;
    }
  };
  for (let x = 0; x < width; x += 1) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 1; y < height - 1; y += 1) { enqueue(y * width); enqueue(y * width + width - 1); }
  const borderBackgroundRatio = borderSamples ? borderBackground / borderSamples : 0;
  if (borderBackgroundRatio < 0.45) {
    return { confident: false, reason: "background_confidence_low", left: 0, top: 0, width, height, occupancy: 1, borderBackgroundRatio };
  }
  while (head < tail) {
    const index = queue[head++]!;
    const x = index % width;
    const y = Math.floor(index / width);
    const neighbors = [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1];
    for (const neighbor of neighbors) {
      if (neighbor >= 0 && !background[neighbor] && isBackground(neighbor)) {
        background[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
  }
  let left = width; let right = -1; let top = height; let bottom = -1; let subjectPixels = 0;
  for (let index = 0; index < size; index += 1) {
    if (background[index]) continue;
    subjectPixels += 1;
    const x = index % width; const y = Math.floor(index / width);
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left || bottom < top || subjectPixels < Math.max(16, size * 0.002)) {
    return { confident: false, reason: "subject_not_detected", left: 0, top: 0, width, height, occupancy: 0, borderBackgroundRatio };
  }
  return { confident: true, reason: "normalized", left, top, width: right - left + 1, height: bottom - top + 1, occupancy: subjectPixels / size, borderBackgroundRatio };
}
