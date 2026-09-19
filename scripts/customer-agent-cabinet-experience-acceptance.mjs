import assert from "node:assert/strict";

import { chromium } from "playwright-core";

const baseUrl = process.env.CABINET_ACCEPTANCE_BASE_URL ?? "http://localhost:3011";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl)) {
  throw new Error("Cabinet experience fixture acceptance is local-only.");
}

const identities = {
  agent: ["test.agent.novotech@example.test", "TestAgent123!"],
  onboarding: ["test.agent.onboarding@example.test", "TestAgent123!"],
  customer: ["test.customer.novotech@example.test", "TestCustomer123!"],
};
const viewports = [[390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_EXECUTABLE_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const results = [];

try {
  for (const [width, height] of viewports) {
    const agent = await openSignedInPage(identities.agent, "/agent", { width, height });
    await assertCabinet(agent, "/agent", 5, width);
    await assertAgentHome(agent, "ru");
    await agent.goto(`${baseUrl}/agent?lang=ro`);
    await assertCabinet(agent, "/agent", 5, width);
    await assertAgentHome(agent, "ro");
    await agent.context().close();

    const customer = await openSignedInPage(identities.customer, "/account", { width, height });
    await assertCabinet(customer, "/account", 5, width);
    await assertCustomerHome(customer, "ru");
    await customer.goto(`${baseUrl}/account?lang=ro`);
    await assertCabinet(customer, "/account", 5, width);
    await assertCustomerHome(customer, "ro");
    await customer.context().close();

    results.push({ width, height, agent: "PASS", customer: "PASS", locales: ["ru", "ro"], overflow: false });
  }

  const onboarding = await openSignedInPage(identities.onboarding, "/agent", { width: 390, height: 844 });
  await assertCabinet(onboarding, "/agent", 0, 390);
  await assertVisible(onboarding, "Подготовка кабинета");
  await onboarding.goto(`${baseUrl}/agent?lang=ro`);
  await assertVisible(onboarding, "Pregătirea cabinetului");
  await assertVisible(onboarding, "Neverificat");
  await onboarding.context().close();

  const qr = await openSignedInPage(identities.agent, "/agent/qr", { width: 390, height: 844 });
  await qr.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
  await assertCabinet(qr, "/agent/qr", 5, 390);
  await assertVisible(qr, "Копировать ссылку");
  await qr.getByRole("button", { name: "Копировать ссылку" }).click();
  await assertVisible(qr, "Скопировано");
  await qr.goto(`${baseUrl}/agent/qr?lang=ro`);
  await assertCabinet(qr, "/agent/qr", 5, 390);
  await assertVisible(qr, "Copiază linkul");
  assert.equal(await qr.locator("main svg").count() > 0, true, "Agent QR is missing");
  await qr.context().close();

  console.log(JSON.stringify({ results, onboarding: "PASS", qr: "PASS", financialUi: "ABSENT", productionMutation: false }));
} finally {
  await browser.close();
}

async function openSignedInPage([email, password], nextPath, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });
  page.__runtimeErrors = runtimeErrors;
  await page.goto(`${baseUrl}/auth/sign-in?next=${encodeURIComponent(nextPath)}`);
  await page.getByLabel("Электронная почта").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL(`${baseUrl}${nextPath}`);
  await page.locator("main").waitFor({ state: "visible" });
  return page;
}

async function assertCabinet(page, path, navCount, width) {
  assert.equal(new URL(page.url()).pathname, path);
  if (navCount > 0) {
    await page.locator("nav").waitFor({ state: "visible" });
    await page.waitForFunction(
      (expectedCount) => document.querySelectorAll("nav a").length === expectedCount,
      navCount,
    );
  }
  const geometry = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    navigationLinks: document.querySelectorAll("nav a").length,
    smallInteractive: [...document.querySelectorAll("main a, main button, nav a")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.height < 44;
    }).map((element) => element.textContent?.trim() ?? ""),
  }));
  assert.equal(geometry.overflow, false, `${path} overflows at width ${width}`);
  assert.equal(geometry.navigationLinks, navCount, `${path} has an unexpected primary navigation count`);
  if (width <= 768) assert.deepEqual(geometry.smallInteractive, [], `${path} has sub-44px touch targets`);
  assert.deepEqual(page.__runtimeErrors, [], `${path} emitted browser/runtime errors`);
}

async function assertAgentHome(page, locale) {
  await assertVisible(page, locale === "ro" ? "Creează recomandare" : "Создать рекомендацию");
  await assertVisible(page, locale === "ro" ? "Recomandări curente" : "Текущие рекомендации");
  await assertVisible(page, locale === "ro" ? "Modificări recente" : "Последние изменения");
  await assertVisible(page, "Test Client Active");
  const content = await page.locator("main").innerText();
  assert.doesNotMatch(content, /(?:0\s*MDL|баланс|к выплате|заработано|sold|de plată|câștigat)/i);
}

async function assertCustomerHome(page, locale) {
  await assertVisible(page, locale === "ro" ? "Bine ați venit la NSD" : "Добро пожаловать в NSD");
  await assertVisible(page, locale === "ro" ? "Deschide catalogul" : "Перейти в каталог");
  const content = await page.locator("main").innerText();
  assert.doesNotMatch(content, /(?:0 orders|0 comenzi|0 заказ)/i);
}

async function assertVisible(page, text) {
  await page.getByText(text, { exact: true }).first().waitFor({ state: "visible" });
}
