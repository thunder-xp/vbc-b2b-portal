const MAX_COMPANY_LOGO_BYTES = 2 * 1024 * 1024;

const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type CompanyLogoExtension = (typeof IMAGE_TYPES)[keyof typeof IMAGE_TYPES];

export function validateCompanyLogo(
  bytes: Uint8Array,
  contentType: string,
  fileName: string,
): CompanyLogoExtension {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_COMPANY_LOGO_BYTES) {
    throw new Error("COMPANY_LOGO_SIZE");
  }

  const extension = IMAGE_TYPES[contentType as keyof typeof IMAGE_TYPES];
  const fileExtension = fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const extensionMatches = extension === "jpg"
    ? fileExtension === "jpg" || fileExtension === "jpeg"
    : fileExtension === extension;
  if (!extension || !extensionMatches || !matchesImageSignature(bytes, extension)) {
    throw new Error("COMPANY_LOGO_FORMAT");
  }
  return extension;
}

function matchesImageSignature(bytes: Uint8Array, extension: CompanyLogoExtension): boolean {
  if (extension === "png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      .every((value, index) => bytes[index] === value);
  }
  if (extension === "jpg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  }
  return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}
