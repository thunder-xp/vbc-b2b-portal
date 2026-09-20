import assert from "node:assert/strict";

import { chromium } from "playwright-core";

const baseUrl = process.env.CUSTOMER_OBJECT_ACCEPTANCE_BASE_URL ?? "http://127.0.0.1:3105";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl)) throw new Error("Customer Object acceptance is local-only.");

const viewports = [[390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_EXECUTABLE_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const results = [];

try {
  for (const [width, height] of viewports) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("A tree hydrated but some attributes")) runtimeErrors.push(message.text());
    });
    await signIn(page);

    await page.goto(`${baseUrl}/account/objects?lang=ru`);
    const activeObjectPaths = await page.locator('a[href^="/account/objects/"]').evaluateAll((links) => [...new Set(links.map((link) => new URL(link.href).pathname).filter((path) => !path.endsWith("/new")))].slice(0, 2));
    assert.equal(activeObjectPaths.length, 2, "Fixture must expose one populated and one empty active object.");
    let populatedObjectPath;
    for (const objectPath of activeObjectPaths) {
      await page.goto(`${baseUrl}${objectPath}?lang=ru`);
      const objectText = await page.locator('main:not([aria-busy="true"])').last().innerText();
      if (/Приобретённое оборудование/.test(objectText)) populatedObjectPath = objectPath;
    }
    assert.ok(populatedObjectPath, "Fixture must expose a populated object workspace.");
    await page.goto(`${baseUrl}/account/objects?archived=1&lang=ru`);
    const allObjectPaths = await page.locator('a[href^="/account/objects/"]').evaluateAll((links) => [...new Set(links.map((link) => new URL(link.href).pathname).filter((path) => !path.endsWith("/new")))]);
    assert.ok(allObjectPaths.length >= 3, "Fixture must expose archived object history.");

    for (const locale of ["ru", "ro"]) {
      for (const route of ["/account", "/account/purchases", "/account/objects", ...allObjectPaths]) {
        const separator = route.includes("?") ? "&" : "?";
        await page.goto(`${baseUrl}${route}${separator}lang=${locale}`);
        await page.locator('main:not([aria-busy="true"])').last().waitFor({ state: "visible" });
        await page.locator('main[aria-busy="true"]').waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined);
        const geometry = await page.evaluate(() => {
          const interactive = [...document.querySelectorAll('main button, main select, main a[class*="min-h-11"]')].filter((element) => {
            const box = element.getBoundingClientRect();
            return box.width > 0 && box.height > 0;
          });
          return {
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            shortControls: interactive.filter((element) => element.getBoundingClientRect().height < 44).map((element) => element.textContent?.trim() || element.tagName),
            h1Count: document.querySelectorAll("main h1").length,
          };
        });
        assert.equal(geometry.overflow, false, `${route} overflows at ${width}x${height} (${locale})`);
        assert.equal(geometry.h1Count, 1, `${route} must have one page heading (${locale})`);
        if (width <= 768) assert.deepEqual(geometry.shortControls, [], `${route} has sub-44px controls (${locale})`);
      }
    }

    await page.goto(`${baseUrl}${populatedObjectPath}?lang=ru`);
    const workspaceText = await page.locator('main:not([aria-busy="true"])').last().innerText();
    assert.match(workspaceText, /Приобретённое оборудование/);
    assert.match(workspaceText, /Видеонаблюдение/);
    assert.match(workspaceText, /Охранная система/);
    assert.match(workspaceText, /требует внимания/i);
    assert.doesNotMatch(workspaceText, /Установлено|Гарантия действует/);
    assert.deepEqual(runtimeErrors, [], `Runtime errors at ${width}x${height}`);
    results.push({ viewport: `${width}x${height}`, locales: ["ru", "ro"], routes: 7, overflow: false, controls: width <= 768 ? "44px+" : "desktop", runtimeErrors: 0 });
    await context.close();
  }

  console.log(JSON.stringify({ results, objectWorkspaceTestAcceptance: "PASS", productionFixtureRows: 0, productionMutation: false }));
} finally {
  await browser.close();
}

async function signIn(page) {
  await page.goto(`${baseUrl}/auth/sign-in?next=${encodeURIComponent("/account/objects")}`);
  await page.locator('input[name="email"]').fill("test.customer.novotech@example.test");
  await page.locator('input[name="password"]').fill("TestCustomer123!");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.origin === baseUrl && url.pathname !== "/auth/sign-in");
  await page.goto(`${baseUrl}/account/objects`);
  await page.locator('main:not([aria-busy="true"])').last().waitFor({ state: "visible" });
  await page.locator('main[aria-busy="true"]').waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined);
}
