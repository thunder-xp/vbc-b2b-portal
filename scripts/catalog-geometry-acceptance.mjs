import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { chromium } from "playwright-core";

const baseUrl = (process.env.CATALOG_ACCEPTANCE_BASE_URL ?? "https://www.nsd.md").replace(/\/$/, "");
const executablePath = process.env.CHROME_PATH ?? [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find(existsSync);

assert(executablePath, "Set CHROME_PATH to an installed Chromium-compatible browser");

const publicRoutes = [
  ["showcase", "/catalog?lang=ru"],
  ["full", "/catalog?lang=ru&view=all"],
  ["category", "/catalog?lang=ru&category=ipc-86de64d8"],
  ["filtered-category", "/catalog?lang=ru&category=ipc-86de64d8&availability=in_stock"],
];
const partnerRoutes = [
  ["b2b-showcase", "/cabinet/catalog"],
  ["b2b-full-grid", "/cabinet/catalog?view=all"],
  ["b2b-category-set", "/cabinet/catalog?categorySet=security"],
];
const viewports = [
  { width: 1440, height: 1000 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

const browser = await chromium.launch({ executablePath, headless: true });
const results = [];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport,
      storageState: process.env.CATALOG_ACCEPTANCE_STORAGE_STATE,
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    if (process.env.CATALOG_ACCEPTANCE_SHARE_TOKEN) {
      await page.goto(`${baseUrl}/?_vercel_share=${process.env.CATALOG_ACCEPTANCE_SHARE_TOKEN}`, { waitUntil: "networkidle" });
    }

    for (const [name, route] of publicRoutes) {
      await verifyCatalogGeometry(page, `${baseUrl}${route}`, name, viewport, consoleErrors);
    }

    if (process.env.CATALOG_ACCEPTANCE_STORAGE_STATE) {
      for (const [name, route] of partnerRoutes) {
        await verifyCatalogGeometry(page, `${baseUrl}${route}`, name, viewport, consoleErrors);
      }
      await context.addCookies([{ name: "novotech-catalog-view-v1", value: "list", url: baseUrl }]);
      await verifyCatalogGeometry(page, `${baseUrl}/cabinet/catalog?view=all`, "b2b-full-list", viewport, consoleErrors);
    }

    await context.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(results, null, 2));

async function verifyCatalogGeometry(page, url, name, viewport, consoleErrors) {
  consoleErrors.length = 0;
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  assert(response?.ok(), `${name} returned ${response?.status()}`);
  assert(!page.url().includes("/auth/sign-in"), `${name} requires a legitimate partner storage state`);

  const geometry = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("article")];
    const card = cards.find((candidate) => candidate.querySelector("img"));
    if (!card) return null;
    const image = card.querySelector("img");
    const media = image.parentElement;
    const nextCard = cards[cards.indexOf(card) + 1];
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
    };
    return {
      card: rect(card),
      image: rect(image),
      media: rect(media),
      nextCard: nextCard ? rect(nextCard) : null,
      objectFit: getComputedStyle(image).objectFit,
      pageWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });

  assert(geometry, `${name} rendered no product card with an image`);
  const tolerance = 1;
  assert(geometry.media.width > 0 && geometry.media.height > 0, `${name} media area collapsed`);
  assert(geometry.image.width <= geometry.media.width + tolerance, `${name} image is wider than its media area`);
  assert(geometry.image.height <= geometry.media.height + tolerance, `${name} image is taller than its media area`);
  assert(geometry.image.left >= geometry.media.left - tolerance && geometry.image.right <= geometry.media.right + tolerance, `${name} image escapes horizontally`);
  assert(geometry.image.top >= geometry.media.top - tolerance && geometry.image.bottom <= geometry.media.bottom + tolerance, `${name} image escapes vertically`);
  assert(geometry.card.height >= 180 && geometry.card.height <= 800, `${name} card height is unbounded: ${geometry.card.height}`);
  assert(["contain", "cover", "scale-down"].includes(geometry.objectFit), `${name} object-fit is ${geometry.objectFit}`);
  assert(geometry.scrollWidth <= geometry.pageWidth + tolerance, `${name} has horizontal page overflow`);
  if (geometry.nextCard) {
    const separated = geometry.card.right <= geometry.nextCard.left + tolerance || geometry.card.bottom <= geometry.nextCard.top + tolerance;
    assert(separated, `${name} neighboring cards overlap`);
  }
  assert.equal(consoleErrors.length, 0, `${name} console errors: ${consoleErrors.join(" | ")}`);
  results.push({ name, viewport: viewport.width, ...geometry });
}
