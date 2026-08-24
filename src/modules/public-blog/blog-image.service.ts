import "server-only";

import sharp from "sharp";

const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export class BlogImageError extends Error {}

export async function processBlogHero(file: File) {
  if (!MIME_TYPES.has(file.type) || file.size < 1 || file.size > MAX_INPUT_BYTES) throw new BlogImageError();
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), { failOn: "error", limitInputPixels: 40_000_000 }).rotate().resize({ width: 1600, height: 900, fit: "cover", withoutEnlargement: true });
    const bytes = await image.webp({ quality: 82, effort: 4 }).toBuffer();
    const metadata = await sharp(bytes).metadata();
    if (!metadata.width || !metadata.height || bytes.byteLength > 2 * 1024 * 1024) throw new BlogImageError();
    return { bytes, width: metadata.width, height: metadata.height };
  } catch (error) {
    if (error instanceof BlogImageError) throw error;
    throw new BlogImageError();
  }
}
