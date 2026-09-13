import "server-only";

import { createSign, randomUUID } from "node:crypto";

export const FIREBASE_PRODUCT_IMAGE_BUCKET = "novotech-systems-5449b.appspot.com";
const TOKEN_AUDIENCE = "https://oauth2.googleapis.com/token";
const STORAGE_SCOPE = "https://www.googleapis.com/auth/devstorage.read_write";

export type StoredFirebaseImage = {
  bucket: string;
  objectPath: string;
  canonicalUrl: string;
};

export type FirebaseStorageConfiguration = {
  configured: boolean;
  bucket: string;
  credentialModel: "dedicated_service_account";
  missing: string[];
};

export class FirebaseProductImageStorageError extends Error {
  constructor(readonly safeCode: string) {
    super(safeCode);
    this.name = "FirebaseProductImageStorageError";
  }
}

type FirebaseCredentials = { clientEmail: string; privateKey: string };
let cachedToken: { value: string; expiresAt: number } | null = null;

export function inspectFirebaseProductImageStorageConfiguration(): FirebaseStorageConfiguration {
  const required: Array<[string, string | undefined]> = [
    ["FIREBASE_PRODUCT_IMAGES_CLIENT_EMAIL", process.env.FIREBASE_PRODUCT_IMAGES_CLIENT_EMAIL],
    ["FIREBASE_PRODUCT_IMAGES_PRIVATE_KEY", process.env.FIREBASE_PRODUCT_IMAGES_PRIVATE_KEY],
  ];
  const missing = required.flatMap(([name, value]) => value?.trim() ? [] : [name]);
  const configuredBucket = process.env.FIREBASE_PRODUCT_IMAGES_BUCKET?.trim();
  if (configuredBucket && configuredBucket !== FIREBASE_PRODUCT_IMAGE_BUCKET) {
    missing.push("FIREBASE_PRODUCT_IMAGES_BUCKET_EXACT_MATCH");
  }
  return {
    configured: missing.length === 0,
    bucket: FIREBASE_PRODUCT_IMAGE_BUCKET,
    credentialModel: "dedicated_service_account",
    missing,
  };
}

export class FirebaseProductImageStorage {
  async verifyAccess(): Promise<void> {
    const token = await accessToken();
    const url = new URL(`https://storage.googleapis.com/storage/v1/b/${FIREBASE_PRODUCT_IMAGE_BUCKET}/o`);
    url.searchParams.set("prefix", "products/");
    url.searchParams.set("maxResults", "1");
    url.searchParams.set("fields", "items(name)");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new FirebaseProductImageStorageError(`FIREBASE_BUCKET_ACCESS_${response.status}`);
  }

  async upload(input: {
    objectPath: string;
    bytes: Buffer;
    contentType: string;
  }): Promise<StoredFirebaseImage> {
    assertManagedObjectPath(input.objectPath);
    const token = await accessToken();
    const downloadToken = randomUUID();
    const boundary = `catalog-image-${randomUUID()}`;
    const url = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${FIREBASE_PRODUCT_IMAGE_BUCKET}/o`);
    url.searchParams.set("uploadType", "multipart");
    url.searchParams.set("fields", "bucket,name");
    const metadata = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({
        name: input.objectPath,
        cacheControl: "public, max-age=31536000, immutable",
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      })}\r\n--${boundary}\r\nContent-Type: ${input.contentType}\r\n\r\n`,
      "utf8",
    );
    const ending = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: new Uint8Array(Buffer.concat([metadata, input.bytes, ending])),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new FirebaseProductImageStorageError(`FIREBASE_UPLOAD_${response.status}`);
    const payload = await response.json() as { bucket?: unknown; name?: unknown };
    if (payload.bucket !== FIREBASE_PRODUCT_IMAGE_BUCKET || payload.name !== input.objectPath) {
      throw new FirebaseProductImageStorageError("FIREBASE_UPLOAD_RESPONSE_INVALID");
    }
    return {
      bucket: FIREBASE_PRODUCT_IMAGE_BUCKET,
      objectPath: input.objectPath,
      canonicalUrl: `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_PRODUCT_IMAGE_BUCKET}/o/${encodeURIComponent(input.objectPath)}?alt=media&token=${downloadToken}`,
    };
  }

  async deleteManagedObject(objectPath: string): Promise<void> {
    assertManagedObjectPath(objectPath);
    const response = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${FIREBASE_PRODUCT_IMAGE_BUCKET}/o/${encodeURIComponent(objectPath)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${await accessToken()}` },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok && response.status !== 404) {
      throw new FirebaseProductImageStorageError(`FIREBASE_DELETE_${response.status}`);
    }
  }
}

export function managedFirebaseObjectPathFromUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "firebasestorage.googleapis.com") return null;
    const prefix = `/v0/b/${FIREBASE_PRODUCT_IMAGE_BUCKET}/o/`;
    if (!url.pathname.startsWith(prefix)) return null;
    const objectPath = decodeURIComponent(url.pathname.slice(prefix.length));
    assertManagedObjectPath(objectPath);
    return objectPath;
  } catch {
    return null;
  }
}

function assertManagedObjectPath(value: string): void {
  if (!/^products\/[0-9a-f-]{36}\/[0-9a-f]{64}\.(?:jpg|jpeg|png|webp)$/i.test(value)) {
    throw new FirebaseProductImageStorageError("FIREBASE_OBJECT_PATH_INVALID");
  }
}

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const credentials = credentialsFromEnvironment();
  const now = Math.floor(Date.now() / 1_000);
  const assertion = signJwt(
    { alg: "RS256", typ: "JWT" },
    {
      iss: credentials.clientEmail,
      scope: STORAGE_SCOPE,
      aud: TOKEN_AUDIENCE,
      iat: now,
      exp: now + 3_000,
    },
    credentials.privateKey,
  );
  const response = await fetch(TOKEN_AUDIENCE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new FirebaseProductImageStorageError(`FIREBASE_AUTH_${response.status}`);
  const payload = await response.json() as { access_token?: unknown; expires_in?: unknown };
  if (typeof payload.access_token !== "string") {
    throw new FirebaseProductImageStorageError("FIREBASE_AUTH_RESPONSE_INVALID");
  }
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3_000;
  cachedToken = { value: payload.access_token, expiresAt: Date.now() + expiresIn * 1_000 };
  return cachedToken.value;
}

function credentialsFromEnvironment(): FirebaseCredentials {
  const status = inspectFirebaseProductImageStorageConfiguration();
  if (!status.configured) throw new FirebaseProductImageStorageError("FIREBASE_CREDENTIALS_NOT_CONFIGURED");
  return {
    clientEmail: process.env.FIREBASE_PRODUCT_IMAGES_CLIENT_EMAIL!.trim(),
    privateKey: process.env.FIREBASE_PRODUCT_IMAGES_PRIVATE_KEY!.replace(/\\n/g, "\n"),
  };
}

function signJwt(header: Record<string, unknown>, claims: Record<string, unknown>, privateKey: string): string {
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(privateKey).toString("base64url")}`;
}

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}
