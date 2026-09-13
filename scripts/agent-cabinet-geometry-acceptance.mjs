import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseUrl = process.env.AGENT_ACCEPTANCE_BASE_URL ?? "http://localhost:3011";
const email = process.env.AGENT_ACCEPTANCE_EMAIL;
const password = process.env.AGENT_ACCEPTANCE_PASSWORD;
if (!email || !password) throw new Error("AGENT_ACCEPTANCE_EMAIL and AGENT_ACCEPTANCE_PASSWORD are required.");

const executablePath = process.env.CHROME_EXECUTABLE_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true });
const results = [];
try {
  for (const [width, height] of [[390,844],[430,932],[768,1024],[1024,768],[1440,900],[1920,1080]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(`${baseUrl}/auth/sign-in?next=%2Fagent`);
    await page.getByLabel("Электронная почта").fill(email);
    await page.getByLabel("Пароль").fill(password);
    await page.getByRole("button", { name: "Войти" }).click();
    await page.waitForURL(`${baseUrl}/agent`);
    for (const route of ["/agent","/agent/clients","/agent/referrals","/agent/qr","/agent/materials","/agent/profile"]) {
      await page.goto(`${baseUrl}${route}`);
      const geometry = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        smallInteractive: [...document.querySelectorAll("main a, main button")].filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.height < 44;
        }).map((element) => element.textContent?.trim() ?? ""),
      }));
      assert.equal(geometry.overflow, false, `${route} overflows at ${width}x${height}`);
      assert.deepEqual(geometry.smallInteractive, [], `${route} has sub-44px controls at ${width}x${height}`);
    }
    results.push({ width, height, routes: 6, overflow: false, controls: "44px+" });
    await page.close();
  }
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
