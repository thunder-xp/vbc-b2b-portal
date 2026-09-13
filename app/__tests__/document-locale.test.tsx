import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const { headers } = vi.hoisted(() => ({ headers: vi.fn() }));
vi.mock("next/headers", () => ({ headers }));

import RootLayout from "../layout";
import { proxy } from "../../proxy";

describe("document locale and canonical host", () => {
  it.each([
    ["ro", "ro"],
    ["ru", "ru"],
    ["unsupported", "ru"],
  ])("server-renders %s requests with html lang=%s", async (requestLocale, expected) => {
    headers.mockResolvedValue(new Headers({ "x-novotech-document-locale": requestLocale }));
    const document = await RootLayout({ children: "content" });
    expect(document.props.lang).toBe(expected);
  });

  it("derives the trusted document locale from the query", () => {
    const response = proxy(new NextRequest("https://www.nsd.md/catalog?lang=ro", {
      headers: { "x-novotech-document-locale": "ru" },
    }));
    expect(response.headers.get("x-middleware-request-x-novotech-document-locale")).toBe("ro");
  });

  it("redirects the apex host directly while preserving path and query", () => {
    const response = proxy(new NextRequest("https://nsd.md/catalog?lang=ro&category=cameras"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://www.nsd.md/catalog?lang=ro&category=cameras");
  });

  it("keeps anonymous catalog requests deterministic and cookie-free", () => {
    const response = proxy(new NextRequest("https://www.nsd.md/catalog"));
    expect(response.headers.get("x-middleware-request-x-novotech-popular-session")).toBeNull();
    expect(response.cookies.getAll()).toEqual([]);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("removes a browser-supplied Popular session header", () => {
    const response = proxy(new NextRequest("https://www.nsd.md/catalog", {
      headers: { "x-novotech-popular-session": "attacker-controlled" },
    }));
    expect(response.headers.get("x-middleware-request-x-novotech-popular-session")).toBeNull();
  });

  it("blocks non-search catalog crawlers while preserving search indexing", () => {
    for (const userAgent of ["ClaudeBot", "GPTBot", "Amazonbot"]) {
      expect(proxy(new NextRequest("https://www.nsd.md/catalog", { headers: { "user-agent": userAgent } })).status).toBe(403);
    }
    for (const userAgent of ["Googlebot", "bingbot", "OAI-SearchBot"]) {
      expect(proxy(new NextRequest("https://www.nsd.md/catalog", { headers: { "user-agent": userAgent } })).status).toBe(200);
    }
  });
});
