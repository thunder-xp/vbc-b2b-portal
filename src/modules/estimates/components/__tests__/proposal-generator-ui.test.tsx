import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = readFileSync(resolve("src/modules/estimates/components/ProposalGeneratorWorkspace.tsx"), "utf8");
const calculator = readFileSync(resolve("src/modules/estimates/components/ProposalQuickCalculator.tsx"), "utf8");
const review = readFileSync(resolve("src/modules/estimates/components/ProposalGeneratorReview.tsx"), "utf8");
const navigation = readFileSync(resolve("src/modules/partner-cabinet/services/workspace-capability.service.ts"), "utf8");
const adminProfiles = readFileSync(resolve("src/modules/estimates/components/AdminProposalGeneratorProfiles.tsx"), "utf8");
const adminCctvServices = readFileSync(resolve("src/modules/estimates/components/AdminCctvCameraPools.tsx"), "utf8");

describe("proposal generator UI contract", () => {
  it("keeps one canonical navigation entry", () => {
    expect(navigation).toContain('label: "Генератор КП"');
    expect(navigation).toContain('href: "/cabinet/estimates/generator"');
    expect(navigation).not.toContain("Быстрый расчёт");
  });
  it("offers two modes and remembers the selection in session storage", () => {
    expect(workspace).toContain("copy.quickTitle"); expect(workspace).toContain("copy.descriptionTitle");
    expect(workspace).toContain("novotech-proposal-generator-mode");
    expect(workspace).toContain('dynamic(() => import("./ProposalQuickCalculator")');
  });
  it("uses three calculator steps and minimal CCTV controls", () => {
    expect(calculator).toContain("{copy.step} {step} {copy.ofThree}"); expect(workspace).toContain("copy.resultStep");
    for (const label of ["copy.indoorCameras", "copy.outdoorCameras", "copy.archiveDays", "copy.cableApproximate", "copy.additionalParameters"]) expect(calculator).toContain(label);
    expect(calculator).toContain("title={copy.recorder}");
    expect(calculator).toContain("copy.automatic"); expect(calculator).toContain("copy.notNeeded");
    expect(calculator).toContain("CCTV_CAMERA_RESOLUTIONS.map");
  });
  it("uses a semantic lightweight icon for every object type", () => {
    for (const icon of ["Building2", "House", "Store", "Warehouse", "Factory", "Utensils", "Shapes"]) expect(calculator).toContain(`icon: ${icon}`);
    expect(calculator).toContain("const ObjectIcon = object.icon");
    expect(calculator).not.toContain("<Video aria-hidden");
  });
  it("uses the approved five-row CCTV parameter workspace", () => {
    expect(calculator).toContain("function ParameterRow");
    expect(calculator.match(/<ParameterRow/g)).toHaveLength(5);
    for (const title of ["copy.indoorCameras", "copy.outdoorCameras", "copy.recorder", "copy.archiveStorage", "copy.cable"]) expect(calculator).toContain(`title={${title}}`);
    for (const label of ["copy.indoorHint", "copy.outdoorHint", "copy.recorderHint", "copy.archiveHint", "copy.cableHint", "copy.resolutionMp", "copy.channelCount", "copy.cableLength"]) expect(calculator).toContain(label);
    for (const icon of ["Camera", "Cctv", "Server", "HardDrive", "Cable"]) expect(calculator).toContain(`icon={${icon}}`);
    expect(calculator).toContain("divide-y divide-zinc-200");
    expect(calculator).toContain("copy.additionalOptions");
    expect(calculator).toContain("md:grid-cols-3");
  });
  it("keeps responsive controls bounded and advanced parameters collapsed by default", () => {
    expect(calculator).toContain("min-w-0");
    expect(calculator).toContain("md:grid-cols-2");
    expect(calculator).toContain("lg:grid-cols-[minmax(16rem,1.15fr)_minmax(11rem,0.85fr)_minmax(11rem,0.85fr)]");
    expect(calculator).toContain("const [advanced, setAdvanced] = useState(false)");
    expect(calculator).toContain("open={advanced}");
  });
  it("updates authoritative replacement identity and RETAIL presentation", () => {
    expect(review).toContain("selectCatalog(item)");
    expect(review).toContain("resolvedSku: item.sku");
    expect(review).toContain("resolvedImageUrl: item.imageUrl");
    expect(review).toContain("resolvedHasCover: item.hasCover");
    expect(review).toContain("<NomenclatureCover");
    expect(review).toContain("retailPriceAmount");
    expect(review).toContain("resolvedStockLabel");
    expect(review).toContain("copy.originalNeed");
    expect(workspace).toContain("governedResolvedId");
    expect(workspace).toContain("copy.recorderReplacementUnverified");
  });
  it("never silently ignores estimate creation", () => {
    expect(workspace).toContain("copy.chooseCustomer");
    expect(workspace).toContain("copy.createFailed");
    expect(workspace).toContain("copy.createEstimate");
    expect(workspace).toContain("scrollIntoView");
  });
  it("converges both modes into one review and delays customer context", () => {
    expect(workspace).toContain("ProposalGeneratorReview"); expect(workspace).toContain("createPanelOpen");
    expect(workspace.indexOf("FinalCustomerPicker")).toBeLessThan(workspace.indexOf("function ProposalGeneratorWorkspace"));
    expect(review).toContain("GENERATOR_SECTIONS.map"); expect(review).toContain("copy.keepAsNeed");
  });
  it("keeps responsive bounded layouts and explicit unresolved states", () => {
    expect(workspace).toContain("overflow-x-clip"); expect(review).toContain("lg:grid-cols-");
    expect(calculator).toContain("sm:grid-cols-2"); expect(review).toContain("copy.priceClarified");
    expect(review).toContain("3rem_minmax(11rem,1fr)_5.5rem_8.5rem_auto");
    expect(review).toContain("aria-label={copy.section}");
  });
  it("shows known-position totals, unpriced-work disclosure, and canonical shared service tariffs", () => {
    expect(workspace).toContain("copy.calculation");
    expect(workspace).toContain("copy.knownCost");
    expect(workspace).toContain("copy.missingPricePrefix");
    expect(adminProfiles).toContain("Цена берётся из опубликованного общего тарифа монтажных услуг");
    expect(adminProfiles).not.toContain("updateProposalGeneratorServicePriceAction");
    expect(adminCctvServices).toContain("Общий тариф");
    expect(adminCctvServices).toContain("saveCctvServiceConfigurationAction");
  });
  it("prefers the governed MDL calculator currency when it is available", () => {
    expect(workspace).toContain('currencies.includes("MDL") ? "MDL" : currencies[0] ?? "USD"');
  });
  it("captures the estimate VAT choice before generator hand-off", () => {
    expect(workspace).toContain('useState<"none" | "included">("none")');
    expect(workspace).toContain("label={copy.vat}");
    expect(workspace).toContain('value="included">{copy.vatIncluded}');
    expect(workspace).toContain("currencyCode, vatMode, validityDays");
  });
  it("presents Step 3 as a technical configuration review", () => {
    expect(workspace).toContain("copy.resultStep");
    expect(workspace).toContain("copy.reviewConfiguration");
    expect(workspace).toContain("copy.configurationReady");
    expect(workspace).toContain("copy.configurationWarning");
    expect(workspace).toContain("copy.recommendationOne");
    expect(workspace).toContain("copy.configurationBlocking");
    for (const decision of ["copy.recorder", "copy.archive"]) expect(workspace).toContain(`title={${decision}}`);
    expect(workspace).toContain('title="PoE"');
    expect(workspace).not.toContain("Изменить исходные данные");
  });
  it("uses the canonical row states and primary replacement identity", () => {
    for (const state of ["copy.selectedAutomatically", "copy.selectedManually", "copy.selectionRequired", "copy.incompatible"]) expect(review).toContain(state);
    expect(review).toContain("line.resolvedLabel ?? line.description");
    expect(review).toContain("resolvedStockLabel: item.stock");
    expect(review).toContain('line.resolution === "unresolved" ? copy.choose : copy.replace');
    expect(review).toContain("aria-label={copy.section}");
    expect(review).toContain('item.itemType === "service" ? ""');
  });
  it("guards the actual calculator recorder identity after replacement", () => {
    expect(workspace).toContain('line.id === "cctv-nvr"');
    expect(workspace).not.toContain('line.id === "cctv-recorder"');
  });
});
