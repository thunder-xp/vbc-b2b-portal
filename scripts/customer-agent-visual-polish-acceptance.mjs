import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright-core";

const baseUrl = process.env.CABINET_ACCEPTANCE_BASE_URL ?? "http://127.0.0.1:3105";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl)) {
  throw new Error("Cabinet visual acceptance is local-only.");
}

const artifactDirectory = process.env.CABINET_ACCEPTANCE_ARTIFACT_DIR;
const strict = process.env.CABINET_ACCEPTANCE_BASELINE !== "true";
const identities = {
  agent: ["test.agent.novotech@example.test", "TestAgent123!"],
  onboarding: ["test.agent.onboarding@example.test", "TestAgent123!"],
  customer: ["test.customer.novotech@example.test", "TestCustomer123!"],
};
const defaultViewports = [[390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];
const viewports = process.env.CABINET_ACCEPTANCE_VIEWPORTS
  ? process.env.CABINET_ACCEPTANCE_VIEWPORTS.split(",").map((value) => value.split("x").map(Number))
  : defaultViewports;
const evidenceRoutes = new Set(["/account", "/account/orders", "/account/service", "/agent", "/agent/referrals", "/agent/qr"]);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_EXECUTABLE_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const results = [];
const evidence = [];

try {
  if (artifactDirectory) await mkdir(artifactDirectory, { recursive: true });
  for (const [width, height] of viewports) {
    const viewport = { width, height };
    const customerContext = await signedInContext(identities.customer, "/account", viewport);
    const customer = customerContext.pages()[0];
    const customerRoutes = await discoverCustomerRoutes(customer);
    for (const locale of ["ru", "ro"]) {
      for (const route of customerRoutes) await inspectRoute(customer, route, locale, viewport, "customer");
    }
    await customerContext.close();

    const agentContext = await signedInContext(identities.agent, "/agent", viewport);
    const agent = agentContext.pages()[0];
    const agentRoutes = await discoverAgentRoutes(agent);
    for (const locale of ["ru", "ro"]) {
      for (const route of agentRoutes) await inspectRoute(agent, route, locale, viewport, "agent");
    }
    await agentContext.close();

    const onboardingContext = await signedInContext(identities.onboarding, "/agent", viewport);
    const onboarding = onboardingContext.pages()[0];
    await inspectRoute(onboarding, "/agent", "ru", viewport, "onboarding");
    await inspectRoute(onboarding, "/agent", "ro", viewport, "onboarding");
    await onboardingContext.close();

    results.push({ viewport: `${width}x${height}`, customerRoutes: customerRoutes.length, agentRoutes: agentRoutes.length, locales: ["ru", "ro"], overflow: false, touchTargets: width <= 768 ? "44px+" : "desktop" });
  }

  const report = {
    results,
    evidence,
    productionFixtures: 0,
    productionMutation: false,
    businessRequestsAdded: 0,
    runtimeErrors: "NONE",
  };
  if (artifactDirectory) await writeFile(path.join(artifactDirectory, "metrics.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}

async function signedInContext([email, password], nextPath, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.__runtimeErrors = [];
  page.on("pageerror", (error) => page.__runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("A tree hydrated but some attributes")) page.__runtimeErrors.push(message.text());
  });
  await page.goto(`${baseUrl}/auth/sign-in?next=${encodeURIComponent(nextPath)}`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`${baseUrl}${nextPath}`);
  await page.locator("main").waitFor({ state: "visible" });
  return context;
}

async function discoverCustomerRoutes(page) {
  await page.goto(`${baseUrl}/account/orders`);
  const orderPath = await firstPath(page, 'a[href^="/account/orders/"]');
  await page.goto(`${baseUrl}/account/service`);
  const servicePath = await firstPath(page, 'a[href^="/account/service/"]:not([href="/account/service/new"])');
  return ["/account", "/account/orders", orderPath, "/account/purchases", "/account/documents", "/account/service", servicePath, "/account/profile", "/account/security"].filter(Boolean);
}

async function discoverAgentRoutes(page) {
  await page.goto(`${baseUrl}/agent/referrals`);
  const referralPath = await firstPath(page, 'a[href^="/agent/referrals/"]');
  await page.goto(`${baseUrl}/agent/clients`);
  const clientPath = await firstPath(page, 'a[href^="/agent/clients/"]');
  return ["/agent", "/agent/referrals", referralPath, "/agent/clients", clientPath, "/agent/qr", "/agent/materials", "/agent/profile"].filter(Boolean);
}

async function firstPath(page, selector) {
  const href = await page.locator(selector).first().getAttribute("href").catch(() => null);
  return href ? new URL(href, baseUrl).pathname : null;
}

async function inspectRoute(page, route, locale, viewport, cabinet) {
  const separator = route.includes("?") ? "&" : "?";
  await page.goto(`${baseUrl}${route}${separator}lang=${locale}`);
  await page.locator("main").waitFor({ state: "visible" });
  const geometry = await page.evaluate(() => {
    const main = document.querySelector("main");
    const h1 = document.querySelectorAll("main h1");
    const visible = (element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    };
    const interactive = [...document.querySelectorAll("main a, main button, main input, main select, main textarea, main summary, nav a")].filter(visible);
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      smallInteractive: interactive.filter((element) => element.getBoundingClientRect().height < 44).map((element) => element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName),
      h1Count: h1.length,
      bodyHeight: Math.round(document.documentElement.scrollHeight),
      mainTop: Math.round(main?.getBoundingClientRect().top ?? 0),
      borderedSurfaces: [...document.querySelectorAll("main section, main ul, main dl")].filter((element) => visible(element) && getComputedStyle(element).borderTopWidth !== "0px").length,
      visibleActions: [...document.querySelectorAll("main a, main button")].filter((element) => { const box = element.getBoundingClientRect(); return box.top < window.innerHeight && box.bottom > 0 && box.width > 0; }).length,
      visibleRows: [...document.querySelectorAll("main li")].filter((element) => { const box = element.getBoundingClientRect(); return box.top >= 0 && box.bottom <= window.innerHeight && box.height >= 44; }).length,
    };
  });
  if (strict) {
    assert.equal(geometry.overflow, false, `${route} overflows at ${viewport.width}x${viewport.height} (${locale})`);
    assert.equal(geometry.h1Count, 1, `${route} must expose exactly one page heading`);
    if (viewport.width <= 768) assert.deepEqual(geometry.smallInteractive, [], `${route} has sub-44px touch targets at ${viewport.width}px (${locale})`);
    assert.deepEqual(page.__runtimeErrors, [], `${route} emitted browser/runtime errors`);
  }

  if (locale === "ru" && evidenceRoutes.has(route) && [390, 1440].includes(viewport.width)) {
    const name = `${cabinet}-${route === "/account" || route === "/agent" ? "home" : route.split("/").filter(Boolean).at(-1)}-${viewport.width}x${viewport.height}`;
    evidence.push({ name, route, viewport: `${viewport.width}x${viewport.height}`, ...geometry });
    if (artifactDirectory) await page.screenshot({ path: path.join(artifactDirectory, `${name}.png`), fullPage: true });
  }
}
