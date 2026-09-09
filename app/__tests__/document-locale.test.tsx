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

  it("issues one private Popular session and forwards it on the first catalog request", () => {
    const response = proxy(new NextRequest("https://www.nsd.md/catalog"));
    const upstream = response.headers.get("x-middleware-request-x-novotech-popular-session");
    expect(upstream).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.cookies.get("novotech_popular_session")?.value).toBe(upstream);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).not.toContain("Max-Age");
  });

  it("keeps the same Popular subset seed for the same browser session", () => {
    const seed = "11111111-1111-4111-8111-111111111111";
    const response = proxy(new NextRequest("https://www.nsd.md/catalog?lang=ro", {
      headers: { cookie: `novotech_popular_session=${seed}` },
    }));
    expect(response.headers.get("x-middleware-request-x-novotech-popular-session")).toBe(seed);
    expect(response.cookies.get("novotech_popular_session")).toBeUndefined();
  });

  it("does not trust a browser-supplied Popular session header", () => {
    const response = proxy(new NextRequest("https://www.nsd.md/catalog", {
      headers: { "x-novotech-popular-session": "attacker-controlled" },
    }));
    const upstream = response.headers.get("x-middleware-request-x-novotech-popular-session");
    expect(upstream).toMatch(/^[0-9a-f-]{36}$/);
    expect(upstream).not.toBe("attacker-controlled");
  });
});
