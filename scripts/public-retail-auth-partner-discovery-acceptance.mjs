import assert from "node:assert/strict";

import { chromium } from "playwright-core";

const baseUrl = process.env.PUBLIC_UX_ACCEPTANCE_BASE_URL ?? "http://127.0.0.1:3105";
const strict = process.env.PUBLIC_UX_ACCEPTANCE_BASELINE !== "true";
const defaultViewports = [[390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];
const viewports = process.env.PUBLIC_UX_ACCEPTANCE_VIEWPORTS
  ? process.env.PUBLIC_UX_ACCEPTANCE_VIEWPORTS.split(",").map((value) => value.split("x").map(Number))
  : defaultViewports;
const routes = ["/", "/auth", "/auth/customer", "/auth/register", "/partners", "/become-partner"];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_EXECUTABLE_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const results = [];

try {
  for (const [width, height] of viewports) {
    for (const locale of ["ru", "ro"]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
      const page = await context.newPage();
      const runtimeErrors = [];
      page.on("pageerror", (error) => runtimeErrors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) runtimeErrors.push(message.text());
      });

      for (const route of routes) {
        const response = await page.goto(`${baseUrl}${route}?lang=${locale}`, { waitUntil: "networkidle", timeout: 45_000 });
        if (!response?.ok() && !strict) {
          results.push({ viewport: `${width}x${height}`, locale, route, status: response?.status() ?? null });
          continue;
        }
        assert(response?.ok(), `${route} ${locale} returned ${response?.status()}`);
        const metrics = await page.evaluate(() => {
          const visible = (element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
          };
          const header = document.querySelector("header");
          const footer = document.querySelector("footer");
          const main = document.querySelector("main");
          const card = main?.querySelector(":scope > section");
          const interactive = [...(main?.querySelectorAll("a,button,input,select,textarea") ?? [])].filter(visible);
          const undersized = interactive.filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width < 44 || rect.height < 44;
          }).map((element) => ({ tag: element.tagName, text: element.textContent?.trim().slice(0, 50), label: element.getAttribute("aria-label") }));
          const resources = performance.getEntriesByType("resource");
          return {
            h1: [...document.querySelectorAll("h1")].map((element) => element.textContent?.trim()),
            headerVisibleLinkCount: header ? [...header.querySelectorAll("nav a")].filter(visible).length : 0,
            headerVisibleLabels: header ? [...header.querySelectorAll("nav a")].filter(visible).map((element) => element.textContent?.trim()) : [],
            cardHeight: card ? Math.round(card.getBoundingClientRect().height) : null,
            mainHeight: main ? Math.round(main.getBoundingClientRect().height) : null,
            footerHeight: footer ? Math.round(footer.getBoundingClientRect().height) : null,
            footerHeadings: footer ? [...footer.querySelectorAll("section h2")].map((element) => element.textContent?.trim()) : [],
            mainCtaCount: [...(main?.querySelectorAll("a,button") ?? [])].filter(visible).length,
            roleTerms: (main?.innerText.match(/Партн[её]р|Агент|Инсталлятор|Partener|Agent|Instalator/gi) ?? []),
            overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            undersized,
            resourceCount: resources.length,
            supabaseDataRequestCount: resources.filter((entry) => entry.name.includes("supabase") && /\/(?:rest|auth)\/v1\//.test(entry.name)).length,
            supabaseStorageAssetCount: resources.filter((entry) => entry.name.includes("supabase") && entry.name.includes("/storage/v1/")).length,
            authLocaleControls: [...(main?.querySelectorAll("button,a") ?? [])].filter((element) => /^(RU|RO)$/.test(element.textContent?.trim() ?? "") && visible(element)).length,
            body: document.body.innerText,
            accountHref: header?.querySelector('a[aria-label="Личный кабинет"],a[aria-label="Cont personal"]')?.getAttribute("href") ?? null,
          };
        });

        if (strict) {
          assert.equal(metrics.overflowPx, 0, `${route} ${locale} ${width}: horizontal overflow`);
          assert.equal(metrics.h1.length, 1, `${route} ${locale} ${width}: expected one h1`);
          assert.deepEqual(runtimeErrors, [], `${route} ${locale} ${width}: runtime errors`);
          assert.equal(metrics.supabaseDataRequestCount, 0, `${route} ${locale} ${width}: browser Supabase data request found`);
          if (width <= 768) assert.deepEqual(metrics.undersized, [], `${route} ${locale} ${width}: touch target below 44px`);
          if (route === "/") {
            assert.equal(metrics.accountHref, `/auth?lang=${locale}`);
            assert(!/Кабинет партнёра|Cabinet partener/.test(metrics.body));
          }
          if (route === "/auth" || route === "/auth/customer") {
            assert.equal(metrics.authLocaleControls, 0, `${route}: internal locale selector found`);
          }
          if (route === "/auth") {
            assert(!/Партнёр \/ Агент|Partener \/ Agent|рабочей роли|rolului dumneavoastră/i.test(metrics.body), `${route}: role-first auth copy found`);
          }
          if (route === "/auth/customer") {
            assert.equal(metrics.roleTerms.length, 0, `${route}: business-role language found`);
          }
          if (route === "/partners") {
            assert(!/отзыв|recenzi|рейтинг|rating/i.test(metrics.body), "Marketplace reputation leaked into directory");
          }
        }
        results.push({ viewport: `${width}x${height}`, locale, route, ...withoutBody(metrics), runtimeErrors });
      }
      await context.close();
    }
  }
  const report = process.env.PUBLIC_UX_ACCEPTANCE_SUMMARY === "true"
    ? {
        baseUrl,
        strict,
        checkedPages: results.length,
        viewports: [...new Set(results.map((result) => result.viewport))],
        locales: [...new Set(results.map((result) => result.locale))],
        routes,
        overflowFailures: results.filter((result) => result.overflowPx !== 0).length,
        runtimeErrors: results.flatMap((result) => result.runtimeErrors ?? []),
        browserSupabaseDataRequests: results.reduce((total, result) => total + (result.supabaseDataRequestCount ?? 0), 0),
        geometry: results.filter((result) => ["390x844", "1440x900"].includes(result.viewport) && ["/", "/auth", "/auth/customer", "/partners"].includes(result.route)).map(({ viewport, locale, route, headerVisibleLinkCount, cardHeight, footerHeight, mainCtaCount, roleTerms }) => ({ viewport, locale, route, headerVisibleLinkCount, cardHeight, footerHeight, mainCtaCount, roleTermCount: roleTerms?.length ?? 0 })),
      }
    : { baseUrl, strict, results };
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}

function withoutBody({ body, ...metrics }) {
  void body;
  return metrics;
}
