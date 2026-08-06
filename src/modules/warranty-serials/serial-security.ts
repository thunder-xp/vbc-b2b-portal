import "server-only";

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const SERIAL_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{1,119}$/;

export class WarrantySerialConfigurationError extends Error {
  constructor(name: string) {
    super(`Missing or invalid server configuration: ${name}`);
    this.name = "WarrantySerialConfigurationError";
  }
}

export class WarrantySerialValidationError extends Error {
  constructor() {
    super("Серийный номер имеет неверный формат.");
    this.name = "WarrantySerialValidationError";
  }
}

export function normalizeSerial(value: string): string {
  const normalized = value.trim().normalize("NFKC").replace(/\p{White_Space}+/gu, "").toUpperCase();
  if (!SERIAL_PATTERN.test(normalized)) throw new WarrantySerialValidationError();
  return normalized;
}

export function hashSerial(normalizedSerial: string): string {
  const secret = process.env.WARRANTY_SERIAL_HASH_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new WarrantySerialConfigurationError("WARRANTY_SERIAL_HASH_SECRET");
  }
  return createHmac("sha256", secret).update(normalizedSerial, "utf8").digest("hex");
}

export function protectSerial(normalizedSerial: string): string {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(normalizedSerial, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function revealSerial(protectedValue: string): string {
  const [version, iv, tag, encrypted] = protectedValue.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new WarrantySerialValidationError();
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new WarrantySerialValidationError();
  }
}

export function maskSerial(normalizedSerial: string): string {
  if (normalizedSerial.length <= 6) return `${normalizedSerial.slice(0, 1)}***${normalizedSerial.slice(-1)}`;
  return `${normalizedSerial.slice(0, 3)}***${normalizedSerial.slice(-3)}`;
}

function encryptionKey(): Buffer {
  const raw = process.env.WARRANTY_SERIAL_ENCRYPTION_KEY?.trim();
  if (!raw) throw new WarrantySerialConfigurationError("WARRANTY_SERIAL_ENCRYPTION_KEY");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new WarrantySerialConfigurationError("WARRANTY_SERIAL_ENCRYPTION_KEY");
  return key;
}
