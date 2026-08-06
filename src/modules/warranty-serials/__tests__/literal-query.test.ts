import { afterEach, describe, expect, it, vi } from "vitest";
import { OneCODataClient } from "@/src/modules/integration/providers/one-c/one-c-odata-client";

describe("warranty serial literal 1C query", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves 1C filter syntax without URLSearchParams encoding", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ value: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new OneCODataClient({ baseUrl: "https://one-c.test/odata", username: "user", password: "secret", requestTimeoutMs: 1000 });
    await client.getLiteralDateRange("Document_РасходнаяНакладная", {
      startDate: "2021-08-06",
      endDate: "2026-08-06",
      select: "Ref_Key,Date,Контрагент_Key",
      top: 25,
      skip: 0,
    });
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("$filter=Date ge datetime'2021-08-06T00:00:00' and Date le datetime'2026-08-06T23:59:59'");
    expect(url).toContain("&$select=Ref_Key,Date,Контрагент_Key&$top=25&$skip=0&$format=json");
    expect(url).not.toContain("%24filter");
    expect(url).not.toContain("+ge+");
  });
});
