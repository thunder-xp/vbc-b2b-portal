import "server-only";

import sharp from "sharp";

export const NOMENCLATURE_COVER_MAX_SOURCE_BYTES = 2 * 1024 * 1024;
export const NOMENCLATURE_COVER_MAX_OUTPUT_BYTES = 256 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ProcessedNomenclatureCover = {
  bytes: Buffer;
  width: number;
  height: number;
};

export async function processNomenclatureCover(file: File): Promise<ProcessedNomenclatureCover> {
  if (file.size < 1 || file.size > NOMENCLATURE_COVER_MAX_SOURCE_BYTES) throw new NomenclatureCoverError("size");
  if (!ACCEPTED_TYPES.has(file.type)) throw new NomenclatureCoverError("format");

  const source = Buffer.from(await file.arrayBuffer());
  try {
    const image = sharp(source, { failOn: "warning", limitInputPixels: 16_000_000, sequentialRead: true });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || !["jpeg", "png", "webp"].includes(metadata.format ?? "")) {
      throw new NomenclatureCoverError("format");
    }
    const { data, info } = await image.rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 }).toBuffer({ resolveWithObject: true });
    if (!info.width || !info.height || data.byteLength > NOMENCLATURE_COVER_MAX_OUTPUT_BYTES) throw new NomenclatureCoverError("output");
    return { bytes: data, width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof NomenclatureCoverError) throw error;
    throw new NomenclatureCoverError("decode");
  }
}
export class NomenclatureCoverError extends Error {
  constructor(public readonly reason: "size" | "format" | "decode" | "output") {
    super(`NOMENCLATURE_COVER_${reason.toUpperCase()}`);
    this.name = "NomenclatureCoverError";
  }
}
