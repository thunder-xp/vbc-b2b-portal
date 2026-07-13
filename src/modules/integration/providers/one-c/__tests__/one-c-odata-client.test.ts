import { afterEach, describe, expect, it, vi } from "vitest";

import { IntegrationODataError } from "../../../errors";
import {
  getOneCODataErrorResponseBody,
  OneCODataClient,
  OneCODataResponseValidationError,
} from "../one-c-odata-client";
import { getOneCSafeDiagnostic } from "../one-c-safe-diagnostic";

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

  it("accepts the live OData v3 JSON envelope with charset and DataServiceVersion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(
      { "odata.metadata": "metadata", value: [{ Ref_Key: "reference" }] },
      "application/json;charset=utf-8",
      { DataServiceVersion: "3.0" },
    )));

    await expect(client().get("Catalog_Контрагенты")).resolves.toEqual({
      "odata.metadata": "metadata",
      value: [{ Ref_Key: "reference" }],
    });
  });

  it("recognizes the live odata.error envelope and preserves request diagnostics", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      "odata.error": {
        code: "-1",
        message: { lang: "ru", value: "not exposed" },
      },
    }), {
      status: 500,
      headers: { "content-type": "application/json;charset=utf-8" },
    })));

    try {
      await client().get("Catalog_Контрагенты", {
        $select: "Ref_Key,Code",
        $filter: "Code eq 'UU-000954'",
        $top: "10",
      }, { requestKind: "partner_code_query" });
      throw new Error("Expected an OData error.");
    } catch (error) {
      expect(error).toBeInstanceOf(IntegrationODataError);
      expect(getOneCSafeDiagnostic(error)).toMatchObject({
        failedStage: "partner_code_query",
        statusCode: 500,
        resourceName: "Catalog_Контрагенты",
        queryParameterNames: ["$select", "$filter", "$top", "$format"],
        jsonParseFailure: false,
      });
      expect(getOneCODataErrorResponseBody(error)).toContain('"odata.error"');
    }
  });

  it.each([
    ["UTF-8 BOM", `\uFEFF${JSON.stringify({ value: [] })}`],
    ["leading whitespace", ` \n\t${JSON.stringify({ value: [] })}`],
  ])("parses a JSON response with %s", async (_label, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, {
      status: 200,
      headers: { "content-type": "application/json;charset=utf-8" },
    })));

    await expect(client().get("Catalog_Контрагенты")).resolves.toEqual({ value: [] });
  });

  it.each([
    ["empty body", "", null, false, true],
    ["truncated JSON", '{"value":', "SyntaxError", false, false],
  ])("preserves safe diagnostics for %s", async (_label, body, parseErrorName, bomDetected, emptyBody) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, {
      status: 200,
      headers: { "content-type": "application/json;charset=utf-8" },
    })));

    try {
      await client().get("Catalog_Контрагенты", { $top: "1" }, { requestKind: "partner_code_query" });
      throw new Error("Expected a JSON response validation error.");
    } catch (error) {
      const diagnostic = getOneCSafeDiagnostic(error);
      expect(diagnostic).toMatchObject({
        failedStage: "odata_response",
        receivedContentType: "application/json;charset=utf-8",
        requestKind: "partner_code_query",
        resourceName: "Catalog_Контрагенты",
        queryParameterNames: expect.arrayContaining(["$top", "$format"]),
        statusCode: 200,
        jsonParseFailure: true,
        parseErrorName,
        bomDetected,
        emptyBody,
      });
      expect(diagnostic?.bodyLength).toBeGreaterThanOrEqual(0);
    }
  });

  it("extracts diagnostics from a nested error cause", () => {
    const responseError = new OneCODataResponseValidationError({
      failedStage: "odata_response",
      receivedContentType: "application/json",
      requestKind: "partner_name_query",
      resourceName: "Catalog_Контрагенты",
      queryParameterNames: ["$format"],
      statusCode: 200,
      jsonParseFailure: true,
      parseErrorName: "SyntaxError",
      bodyLength: 8,
      bomDetected: false,
      emptyBody: false,
    });

    expect(getOneCSafeDiagnostic(new Error("wrapper", { cause: responseError }))).toMatchObject({
      requestKind: "partner_name_query",
      failedStage: "odata_response",
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

function jsonResponse(
  payload: unknown,
  contentType = "application/json",
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": contentType, ...headers },
  });
}
