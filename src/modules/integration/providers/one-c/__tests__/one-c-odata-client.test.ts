import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OneCODataClient,
  OneCODataResponseValidationError,
} from "../one-c-odata-client";

describe("OneCODataClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("always requests JSON without duplicating an existing format parameter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ value: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await client().get("Catalog_Контрагенты", { $format: "json", $top: "1" });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(new Headers(init.headers).get("Accept")).toBe("application/json");
    expect(url.searchParams.getAll("$format")).toEqual(["json"]);
  });

  it("adds JSON format when the caller does not provide it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ value: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await client().get("Catalog_Контрагенты");

    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.searchParams.getAll("$format")).toEqual(["json"]);
  });

  it("rejects a successful Atom response before provider mapping", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<feed />", {
      status: 200,
      headers: { "content-type": "application/atom+xml; charset=utf-8" },
    })));

    const request = client().get("Catalog_Контрагенты");

    await expect(request).rejects.toMatchObject({
      name: "OneCODataResponseValidationError",
      failedStage: "odata_response",
      receivedContentType: "application/atom+xml; charset=utf-8",
    });
    await expect(request).rejects.toBeInstanceOf(OneCODataResponseValidationError);
  });

  it("accepts an OData JSON collection with charset", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(
      { "odata.metadata": "metadata", value: [{ Ref_Key: "reference" }] },
      "application/json; charset=utf-8",
    )));

    await expect(client().get("Catalog_Контрагенты")).resolves.toEqual({
      "odata.metadata": "metadata",
      value: [{ Ref_Key: "reference" }],
    });
  });
});

function client(): OneCODataClient {
  return new OneCODataClient({
    baseUrl: "https://erp-api.nsd.md/novotech/odata/standard.odata",
    username: "odata-user",
    password: "odata-password",
    requestTimeoutMs: 10000,
  });
}

function jsonResponse(payload: unknown, contentType = "application/json"): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": contentType },
  });
}
