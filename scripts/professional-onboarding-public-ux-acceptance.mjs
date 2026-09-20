import assert from "node:assert/strict";

import { chromium } from "playwright-core";

const baseUrl = process.env.PROFESSIONAL_ONBOARDING_BASE_URL ?? "http://127.0.0.1:3110";
const baseline = process.env.PROFESSIONAL_ONBOARDING_BASELINE === "true";
const agentEmail = process.env.PROFESSIONAL_ONBOARDING_AGENT_EMAIL;
const agentPassword = process.env.PROFESSIONAL_ONBOARDING_AGENT_PASSWORD;
const viewports = [[390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];
const flows = [
  { id: "agent", path: "/become-partner/agent", extra: {} },
  { id: "installer", path: "/auth/register", extra: { intent: "installer" } },
];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_EXECUTABLE_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const results = [];

try {
  if (!baseline) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/become-partner/agent?lang=ru`, { waitUntil: "networkidle" });
    const target = new URL(page.url());
    assert.equal(target.pathname, "/auth/register", "Unauthenticated Agent entry did not route to Business registration");
    assert.equal(target.searchParams.get("intent"), "agent", "Agent registration intent was not preserved");
    assert.equal(target.searchParams.get("next"), "/become-partner/agent?lang=ru", "Agent safe return target was not preserved");
    await context.close();
  }
  for (const [width, height] of viewports) {
    for (const locale of ["ru", "ro"]) {
      for (const flow of flows) {
        const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
        const page = await context.newPage();
        const runtimeErrors = [];
        page.on("pageerror", (error) => runtimeErrors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) runtimeErrors.push(message.text());
        });
        if (flow.id === "agent" && agentEmail && agentPassword) {
          await signIn(page, locale);
        }
        const query = new URLSearchParams({ lang: locale, ...flow.extra });
        const response = await page.goto(`${baseUrl}${flow.path}?${query}`, { waitUntil: "networkidle", timeout: 45_000 });
        assert(response?.ok(), `${flow.id} ${locale} returned ${response?.status()}`);
        const metrics = await page.evaluate(({ viewportHeight }) => {
          const visible = (element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
          };
          const main = document.querySelector("main");
          const flowRoot = main?.querySelector(":scope > section");
          const form = flowRoot?.querySelector("form") ?? null;
          const fields = [...(flowRoot?.querySelectorAll("input:not([type=hidden]),select,textarea") ?? [])].filter(visible);
          const actions = [...(flowRoot?.querySelectorAll("a,button") ?? [])].filter(visible);
          const interactives = [...(flowRoot?.querySelectorAll("a,button,input:not([type=hidden]),select,textarea") ?? [])].filter(visible);
          const resources = performance.getEntriesByType("resource");
          const text = flowRoot?.innerText ?? "";
          return {
            h1Count: document.querySelectorAll("h1").length,
            pageHeight: document.documentElement.scrollHeight,
            flowHeight: flowRoot ? Math.round(flowRoot.getBoundingClientRect().height) : null,
            formHeight: form ? Math.round(form.getBoundingClientRect().height) : null,
            fieldCount: fields.length,
            requiredFieldCount: fields.filter((field) => field.required).length,
            optionalFieldCount: fields.filter((field) => !field.required).length,
            fieldsAboveFold: fields.filter((field) => field.getBoundingClientRect().bottom <= viewportHeight).length,
            copyCharacters: text.replace(/\s+/g, " ").trim().length,
            ctaCount: actions.length,
            overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            undersized: interactives.filter((element) => {
              const rect = element.getBoundingClientRect();
              return rect.width < 44 || rect.height < 44;
            }).map((element) => ({ tag: element.tagName, name: element.getAttribute("name"), text: element.textContent?.trim().slice(0, 50) })),
            browserSupabaseDataRequests: resources.filter((entry) => entry.name.includes("supabase") && /\/(?:rest|auth)\/v1\//.test(entry.name)).length,
            text,
          };
        }, { viewportHeight: height });
        if (!baseline) {
          assert.equal(metrics.h1Count, 1, `${flow.id} ${locale}: expected one h1`);
          assert.equal(metrics.overflowPx, 0, `${flow.id} ${locale} ${width}: horizontal overflow`);
          assert.deepEqual(runtimeErrors, [], `${flow.id} ${locale} ${width}: runtime errors`);
          assert.equal(metrics.browserSupabaseDataRequests, 0, `${flow.id}: browser Supabase request detected`);
          if (width <= 430) assert.deepEqual(metrics.undersized, [], `${flow.id} ${locale} ${width}: target below 44px`);
          assert(metrics.text.includes(locale === "ru" ? "Назад к выбору" : "Înapoi la alegere"), `${flow.id}: missing safe back navigation`);
          const internalTerm = metrics.text.match(/Supabase|\bRPC\b|database|\benum\b|compliance status|membership|role assignment|access request|marketplace provider/i)?.[0];
          assert(!internalTerm, `${flow.id}: internal terminology exposed (${internalTerm})`);
          if (flow.id === "agent") {
            assert(locale === "ru" ? /коммерческий агент|коммерческого агента/i.test(metrics.text) : /agent comercial/i.test(metrics.text));
            assert(!/%|доход|заработ|comision|venit/i.test(metrics.text), "Agent economics promise exposed");
          } else {
            assert(locale === "ru" ? /инсталлятор/i.test(metrics.text) : /instalator profesionist/i.test(metrics.text));
          }
        }
        delete metrics.text;
        results.push({ viewport: `${width}x${height}`, locale, flow: flow.id, ...metrics, runtimeErrors });
        await context.close();
      }
    }
  }
  if (!baseline && agentEmail && agentPassword) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    await signIn(page, "ru");
    await page.goto(`${baseUrl}/become-partner/agent?lang=ru`, { waitUntil: "networkidle" });
    await page.locator('input[name="displayName"]').fill("A");
    await page.getByRole("button", { name: "Отправить заявку" }).click();
    const validationAlert = page.locator('form [role="alert"]');
    await validationAlert.waitFor();
    const validationMessage = (await validationAlert.textContent())?.trim();
    assert(validationMessage?.includes("Укажите имя"), `Agent validation is not customer-safe (${validationMessage})`);
    await page.locator('input[name="displayName"]').fill("Acceptance Agent");
    await page.getByRole("button", { name: "Отправить заявку" }).click();
    await page.getByRole("heading", { name: "Заявка отправлена на проверку" }).waitFor();
    await page.goto(`${baseUrl}/become-partner/agent?lang=ro`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Cererea a fost trimisă spre verificare" }).waitFor();
    assert.deepEqual(runtimeErrors, [], "Agent validation/submission runtime errors");
    await context.close();
  }
  console.log(JSON.stringify({
    baseUrl,
    baseline,
    checkedPages: results.length,
    overflowFailures: results.filter((result) => result.overflowPx !== 0).length,
    runtimeErrors: results.flatMap((result) => result.runtimeErrors),
    browserSupabaseDataRequests: results.reduce((total, result) => total + result.browserSupabaseDataRequests, 0),
    geometry: results.filter((result) => ["390x844", "1440x900"].includes(result.viewport)),
  }, null, 2));
} finally {
  await browser.close();
}

async function signIn(page, locale) {
  const next = encodeURIComponent(`/become-partner/agent?lang=${locale}`);
  await page.goto(`${baseUrl}/auth/sign-in?lang=${locale}&next=${next}`, { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill(agentEmail);
  await page.locator('input[name="password"]').fill(agentPassword);
  await page.getByRole("button", { name: locale === "ru" ? "Войти" : "Autentificare" }).click();
  await page.waitForURL(/\/become-partner\/agent/, { timeout: 30_000 });
}
