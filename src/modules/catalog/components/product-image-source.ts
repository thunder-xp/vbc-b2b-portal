const PRODUCT_IMAGE_HOSTS = new Set([
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
]);

const FIREBASE_PRODUCT_PATH = /^\/v0\/b\/novotech-systems-5449b\.appspot\.com\/o\//;
const STORAGE_PRODUCT_PATH = /^\/novotech-systems-5449b\.appspot\.com\//;

export type ProductImageSourceKind = "fallback" | "original" | "rejected" | "thumbnail";

export function normalizeProductImageUrl(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("/")) return value.startsWith("//") ? null : value;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !PRODUCT_IMAGE_HOSTS.has(url.hostname)) {
      return null;
    }
    if (url.hostname === "firebasestorage.googleapis.com" && !FIREBASE_PRODUCT_PATH.test(url.pathname)) {
      return null;
    }
    if (url.hostname === "storage.googleapis.com" && !STORAGE_PRODUCT_PATH.test(url.pathname)) {
      return null;
    }
    if ([...url.searchParams.keys()].some((key) => key !== "alt" && key !== "token")) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function classifyProductImageSource(value: string | null): ProductImageSourceKind {
  const normalized = normalizeProductImageUrl(value);
  if (!value) return "fallback";
  if (!normalized) return "rejected";
  return /(?:_|-)thumb(?:nail)?(?:\.|_|-)/i.test(decodeURIComponent(normalized)) ? "thumbnail" : "original";
}

