import "server-only";

import type { OneCEnv } from "@/src/lib/env";
import { isOneCGuid } from "../integration/providers/one-c/one-c-guid";
import { OneCODataClient } from "../integration/providers/one-c/one-c-odata-client";

export const PRODUCT_IMAGE_PROPERTY_KEY = "f637e5a4-4c2b-11ec-bd80-7239d3b7bd5c";
const RESOURCE = "Catalog_Номенклатура";
const SELECT = "Ref_Key,DataVersion,ДополнительныеРеквизиты";

export type OneCAdditionalRequisite = Record<string, unknown> & {
  LineNumber?: unknown;
  Свойство_Key?: unknown;
  Значение?: unknown;
  Значение_Type?: unknown;
  ТекстоваяСтрока?: unknown;
};

export type OneCProductImageState = {
  reference: string;
  dataVersion: string | null;
  requisites: OneCAdditionalRequisite[];
  imageUrl: string | null;
};

export class OneCProductImageGatewayError extends Error {
  constructor(readonly safeCode: string) {
    super(safeCode);
    this.name = "OneCProductImageGatewayError";
  }
}

export class OneCProductImageGateway {
  private readonly client: OneCODataClient;

  constructor(config: OneCEnv) {
    this.client = new OneCODataClient({
      baseUrl: config.baseUrl,
      username: config.username,
      password: config.password,
      requestTimeoutMs: config.requestTimeoutMs,
    });
  }

  async read(reference: string): Promise<OneCProductImageState> {
    if (!isOneCGuid(reference)) throw new OneCProductImageGatewayError("ONEC_PRODUCT_REF_INVALID");
    const payload = await this.client.getFilteredCollection(
      RESOURCE,
      {
        select: SELECT,
        filter: `Ref_Key eq guid'${reference.toLowerCase()}'`,
        top: 1,
      },
      { requestKind: "catalog_product_image_exact_read" },
    );
    const values = envelope(payload);
    if (values.length !== 1) throw new OneCProductImageGatewayError("ONEC_PRODUCT_NOT_FOUND");
    const row = values[0];
    if (!record(row) || typeof row.Ref_Key !== "string" || row.Ref_Key.toLowerCase() !== reference.toLowerCase()) {
      throw new OneCProductImageGatewayError("ONEC_PRODUCT_IDENTITY_MISMATCH");
    }
    const requisites = Array.isArray(row["ДополнительныеРеквизиты"])
      ? row["ДополнительныеРеквизиты"].filter(record)
      : [];
    return {
      reference: row.Ref_Key,
      dataVersion: typeof row.DataVersion === "string" ? row.DataVersion : null,
      requisites,
      imageUrl: readProductImageUrl(requisites),
    };
  }

  async write(reference: string, requisites: OneCAdditionalRequisite[]): Promise<void> {
    await this.client.patchExactGuid(
      RESOURCE,
      reference,
      { "ДополнительныеРеквизиты": requisites },
      ["ДополнительныеРеквизиты"],
    );
  }

  async writeAndVerify(reference: string, imageUrl: string): Promise<OneCProductImageState> {
    const before = await this.read(reference);
    const requisites = withProductImageUrl(before.requisites, imageUrl);
    await this.write(reference, requisites);
    const after = await this.read(reference);
    if (after.imageUrl !== imageUrl) {
      throw new OneCProductImageGatewayError("ONEC_IMAGE_READBACK_MISMATCH");
    }
    return after;
  }
}

export function withProductImageUrl(
  requisites: OneCAdditionalRequisite[],
  imageUrl: string,
): OneCAdditionalRequisite[] {
  if (!isCanonicalFirebaseUrl(imageUrl)) {
    throw new OneCProductImageGatewayError("ONEC_IMAGE_URL_INVALID");
  }
  const existingIndex = requisites.findIndex((item) =>
    typeof item["Свойство_Key"] === "string"
      && item["Свойство_Key"].toLowerCase() === PRODUCT_IMAGE_PROPERTY_KEY,
  );
  if (existingIndex >= 0) {
    return requisites.map((item, index) => index === existingIndex ? { ...item, "Значение": imageUrl } : { ...item });
  }
  const nextLine = requisites.reduce((maximum, item) => {
    const numericLine = typeof item.LineNumber === "string" && /^\d+$/.test(item.LineNumber)
      ? Number(item.LineNumber)
      : item.LineNumber;
    const line = typeof numericLine === "number" && Number.isSafeInteger(numericLine)
      ? numericLine
      : 0;
    return Math.max(maximum, line);
  }, 0) + 1;
  return [
    ...requisites.map((item) => ({ ...item })),
    {
      LineNumber: nextLine,
      "Свойство_Key": PRODUCT_IMAGE_PROPERTY_KEY,
      "Значение": imageUrl,
      "Значение_Type": "Edm.String",
      "ТекстоваяСтрока": "",
    },
  ];
}

export function readProductImageUrl(requisites: OneCAdditionalRequisite[]): string | null {
  const item = requisites.find((candidate) =>
    typeof candidate["Свойство_Key"] === "string"
      && candidate["Свойство_Key"].toLowerCase() === PRODUCT_IMAGE_PROPERTY_KEY,
  );
  return typeof item?.["Значение"] === "string" ? item["Значение"].trim() || null : null;
}

function isCanonicalFirebaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "firebasestorage.googleapis.com"
      && url.pathname.startsWith("/v0/b/novotech-systems-5449b.appspot.com/o/");
  } catch {
    return false;
  }
}

function envelope(value: unknown): unknown[] {
  if (!record(value) || !Array.isArray(value.value)) {
    throw new OneCProductImageGatewayError("ONEC_PRODUCT_RESPONSE_INVALID");
  }
  return value.value;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
