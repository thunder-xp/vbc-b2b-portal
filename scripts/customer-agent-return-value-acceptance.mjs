import assert from "node:assert/strict";

import { chromium } from "playwright-core";

const baseUrl = process.env.CABINET_ACCEPTANCE_BASE_URL ?? "http://localhost:3023";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl)) {
  throw new Error("Return-value UX acceptance is local-only.");
}

const identities = {
  agent: ["test.agent.novotech@example.test", "TestAgent123!"],
  onboarding: ["test.agent.onboarding@example.test", "TestAgent123!"],
  customer: ["test.customer.novotech@example.test", "TestCustomer123!"],
};
const viewports = [[390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];
const orderId = "28000000-0000-4000-8000-000000000001";
const lineId = "29000000-0000-4000-8000-000000000001";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_EXECUTABLE_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const results = [];

try {
  for (const [width, height] of viewports) {
    const viewport = { width, height };
    const customerContext = await signedInContext(identities.customer, "/account/purchases", viewport);
    const customer = customerContext.pages()[0];
    await assertPurchases(customer, width);
    await customer.goto(`${baseUrl}/account/documents`);
    await assertDocuments(customer, width);
    await customer.goto(`${baseUrl}/account/equipment`);
    await customer.waitForURL(`${baseUrl}/account/purchases`);
    await assertPageGeometry(customer, "/account/purchases", width);
    await customer.goto(`${baseUrl}/account/equipment/${lineId}`);
    await assertPurchaseDetail(customer, width);
    await customer.goto(`${baseUrl}/account/purchases?lang=ro`);
    await assertPurchases(customer, width);
    await customer.goto(`${baseUrl}/account/documents?lang=ro&orderId=${orderId}`);
    await assertDocuments(customer, width);
    await customerContext.close();

    const agentContext = await signedInContext(identities.agent, "/agent/qr", viewport);
    const agent = agentContext.pages()[0];
    await assertQr(agent, width, height);
    await agent.goto(`${baseUrl}/agent`);
    await assertActivity(agent, width);
    await agent.goto(`${baseUrl}/agent/profile`);
    await assertProfile(agent, width);
    await agent.goto(`${baseUrl}/agent/qr?lang=ro`);
    await assertQr(agent, width, height);
    await agent.goto(`${baseUrl}/agent/profile?lang=ro`);
    await assertProfile(agent, width);
    await agentContext.close();

    const onboardingContext = await signedInContext(identities.onboarding, "/agent", viewport);
    const onboarding = onboardingContext.pages()[0];
    await assertOnboarding(onboarding, width);
    await onboarding.goto(`${baseUrl}/agent?lang=ro`);
    await assertOnboarding(onboarding, width);
    await onboardingContext.close();

    results.push({ viewport: `${width}x${height}`, customer: "PASS", agent: "PASS", onboarding: "PASS", locales: ["ru", "ro"] });
  }

  console.log(JSON.stringify({
    results,
    currentTruth: "PASS",
    contextualDocuments: "PASS",
    factualOnboarding: "PASS",
    financialUi: "ABSENT",
    horizontalOverflow: "NONE",
    runtimeErrors: "NONE",
    productionMutation: false,
  }));
} finally {
  await browser.close();
}

async function signedInContext([email, password], nextPath, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.__runtimeErrors = [];
  page.on("pageerror", (error) => page.__runtimeErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") page.__runtimeErrors.push(message.text()); });
  await page.goto(`${baseUrl}/auth/sign-in?next=${encodeURIComponent(nextPath)}`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`${baseUrl}${nextPath}`);
  await page.locator("main").waitFor({ state: "visible" });
  return context;
}

async function assertPurchases(page, width) {
  await assertPageGeometry(page, "/account/purchases", width);
  const content = await page.locator("main").innerText();
  assert.match(content, /Dahua DH-HAP320/);
  assert.match(content, /Dahua DHI-ARA11/);
  assert.match(content, /R-2026-990001/);
  assert.match(content, /1[\s,.]?299/);
  assert.equal(await page.locator('a[href*="/account/service/new?orderId="]').count(), 2);
  assert.equal(await page.locator('a[href*="/account/documents?orderId="]').count(), 1);
  assert.equal(await page.locator("main ul > li button").count(), 1, "Only the currently orderable product may expose Buy again");
  assert.equal(await page.locator('a[href*="/products/fixture-"]').count(), 2);
}

async function assertDocuments(page, width) {
  await assertPageGeometry(page, "/account/documents", width);
  const content = await page.locator("main").innerText();
  assert.match(content, /R-2026-990001/);
  assert.match(content, /Dahua DH-HAP320/);
  assert.equal(await page.locator('a[href^="https://example.test/"]').count(), 2);
  assert.doesNotMatch(content, /23000000-|catalog_product_documents|source_product_id/i);
}

async function assertPurchaseDetail(page, width) {
  await assertPageGeometry(page, `/account/equipment/${lineId}`, width);
  const content = await page.locator("main").innerText();
  assert.match(content, /Dahua DH-HAP320/);
  assert.match(content, /R-2026-990001/);
  assert.match(content, /1[\s,.]?299/);
  assert.equal(await page.locator('a[href*="/account/service/new?orderId="]').count(), 1);
  assert.equal(await page.locator('a[href^="https://example.test/"]').count(), 2);
  assert.doesNotMatch(content, /warranty expires|гарантия до|garanția expiră/i);
}

async function assertQr(page, width, height) {
  await assertPageGeometry(page, "/agent/qr", width);
  const qr = page.locator('main [role="img"]');
  await qr.waitFor({ state: "visible" });
  const box = await qr.boundingBox();
  assert.ok(box && box.width >= 200 && box.height >= 200, "QR must stay large enough to scan");
  if (width <= 430) assert.ok(box.y < height * 0.34, "QR must be immediately visible on mobile");
  assert.ok(await page.locator("main button").count() >= 3, "QR controls must remain available");
  const content = await page.locator("main").innerText();
  assert.doesNotMatch(content, /commission|payout|balance|guaranteed|комисси|выплат/i);
}

async function assertActivity(page, width) {
  await assertPageGeometry(page, "/agent", width);
  assert.ok(await page.locator('a[href^="/agent/referrals/"]').count() > 0);
  const content = await page.locator("main").innerText();
  assert.match(content, /Test Client Active/);
  assert.doesNotMatch(content, /0\s*MDL|commission|payout|balance/i);
}

async function assertProfile(page, width) {
  await assertPageGeometry(page, "/agent/profile", width);
  assert.equal(await page.locator('main input:not([type="hidden"])').count(), 5);
  const content = await page.locator("main").innerText();
  assert.match(content, /Test Agent Novotech/);
  assert.doesNotMatch(content, /PROFESSIONAL|STRATEGIC|compliance_status|contract_ready/i);
}

async function assertOnboarding(page, width) {
  await assertPageGeometry(page, "/agent", width);
  assert.equal(await page.locator("main ol > li").count(), 4);
  const content = await page.locator("main").innerText();
  assert.doesNotMatch(content, /\d+\s*%/);
  assert.doesNotMatch(content, /commission|payout|balance/i);
}

async function assertPageGeometry(page, expectedPath, width) {
  await page.locator("main").waitFor({ state: "visible" });
  assert.equal(new URL(page.url()).pathname, expectedPath);
  const geometry = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    smallInteractive: [...document.querySelectorAll("main a, main button, main input, main select")].filter((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.height < 44;
    }).map((element) => element.textContent?.trim() || element.getAttribute("name") || element.tagName),
  }));
  assert.equal(geometry.overflow, false, `${expectedPath} overflows at ${width}px`);
  if (width <= 768) assert.deepEqual(geometry.smallInteractive, [], `${expectedPath} has sub-44px controls at ${width}px`);
  assert.deepEqual(page.__runtimeErrors, [], `${expectedPath} emitted browser/runtime errors`);
}
