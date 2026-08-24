import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync("src/modules/public-retail/components/PublicRetailShell.tsx", "utf8");
const localeSwitch = readFileSync("src/modules/public-retail/components/PublicLocaleSwitch.tsx", "utf8");
const home = readFileSync("app/page.tsx", "utf8");
const product = readFileSync("app/products/[slug]/page.tsx", "utf8");
const catalog = readFileSync("app/catalog/page.tsx", "utf8");
const sitemap = readFileSync("app/sitemap.ts", "utf8");
const adminActions = readFileSync("src/modules/public-blog/actions.ts", "utf8");
const adminEditor = readFileSync("src/modules/public-blog/AdminBlogEditor.tsx", "utf8");

describe("public Blog and branding integration", () => {
  it("uses the inverse locale switch after account and before cart while preserving query state", () => {
    expect(shell.indexOf("CircleUserRound")).toBeLessThan(shell.indexOf("PublicLocaleSwitch locale"));
    expect(shell.indexOf("PublicLocaleSwitch locale")).toBeLessThan(shell.indexOf("PublicRetailCartBadge locale"));
    expect(localeSwitch).toContain('new URLSearchParams(searchParams?.toString() ?? "")');
    expect(localeSwitch).toContain("params.set(\"lang\", nextLocale)");
    expect(shell).not.toContain('href={languageHref("ru")}');
  });

  it("uses one footer brand lockup, removes duplicate contact navigation, and links Blog", () => {
    expect(shell).toContain("PublicBrandLockup background=\"dark\"");
    expect(shell).toContain("NOVOTECH SYSTEMS");
    expect(shell).toContain("DISTRIBUTION");
    expect(shell).toContain("/blog?lang=${locale}");
    expect(shell).not.toContain('<FooterLink href={`/contacts?lang=${locale}`}>{copy.contacts}</FooterLink>');
  });

  it("integrates bounded Blog reads into homepage, product, category, and sitemap", () => {
    expect(home).toContain("getPublicBlogLanding(locale, null, 1, 3)");
    expect(product).toContain("getPublicBlogForProduct(product.id, locale)");
    expect(catalog).toContain("getPublicBlogForCategory(activeCategory.id, locale)");
    expect(sitemap).toContain("getPublicBlogService().sitemap()");
  });

  it("resolves private publication media from the authoritative server snapshot", () => {
    expect(adminActions).toContain("const current = await service.get(articleId, locale)");
    expect(adminActions).toContain('const sourceKey = current.heroSourceStorageKey ?? ""');
    expect(adminActions).not.toContain('form.get("heroSourceStorageKey")');
    expect(adminEditor).not.toContain('name="heroSourceStorageKey"');
  });
});
