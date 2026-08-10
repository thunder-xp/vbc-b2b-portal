import { describe, expect, it } from "vitest";
import { calculateCctvRequirements } from "../proposal-generator-calculator";

const warehouse = {
  objectType: "warehouse" as const, indoorCameraCount: 8, outdoorCameraCount: 4, archiveDays: 30, cableLength: 300,
  installationRequested: true, commissioningRequested: true, remoteViewingRequested: true,
  colorNight: false, highResolution: false, licensePlateRecognition: false, videoAnalytics: false, backupPower: false,
};

describe("CCTV quick calculator", () => {
  it("produces deterministic requirements in the four canonical sections", () => {
    const first = calculateCctvRequirements(warehouse); const second = calculateCctvRequirements(warehouse);
    expect(second).toEqual(first);
    expect(new Set(first.map((line) => line.sectionKey))).toEqual(new Set(["equipment", "installation_materials", "installation_works", "commissioning_works"]));
    expect(first.find((line) => line.profileKey === "cctv.indoor.standard")?.quantity).toBe(8);
    expect(first.find((line) => line.profileKey === "cctv.outdoor.standard")?.quantity).toBe(4);
    expect(first.find((line) => line.profileKey === "cctv.cable.cat5e")?.quantity).toBe(300);
    expect(first.find((line) => line.profileKey === "cctv.storage.8tb")?.quantity).toBe(2);
    expect(first.find((line) => line.profileKey === "cctv.mounting")).toMatchObject({ quantity: 12, sectionKey: "installation_materials", unit: "pcs" });
  });
  it("keeps every derived identity unresolved until an exact profile mapping exists", () => {
    expect(calculateCctvRequirements(warehouse).every((line) => line.resolution === "unresolved" && line.resolvedId === null)).toBe(true);
  });
  it("documents storage assumptions without pretending to exact engineering precision", () => {
    const storage = calculateCctvRequirements(warehouse).find((line) => line.profileKey === "cctv.storage.8tb");
    expect(storage?.assumption).toContain("усреднённом профиле записи");
  });
  it("omits installation and commissioning lines when not requested", () => {
    const result = calculateCctvRequirements({ ...warehouse, installationRequested: false, commissioningRequested: false, remoteViewingRequested: false });
    expect(result.some((line) => line.sectionKey === "installation_works" || line.sectionKey === "commissioning_works")).toBe(false);
  });
  it("uses approved capacity profiles and leaves unsupported capacity unresolved", () => {
    const accepted = calculateCctvRequirements(warehouse);
    expect(accepted.find((line) => line.id === "cctv-nvr")?.profileKey).toBe("cctv.nvr.16");
    expect(accepted.find((line) => line.id === "cctv-poe")?.profileKey).toBe("cctv.poe.16");
    const oversized = calculateCctvRequirements({ ...warehouse, indoorCameraCount: 17, outdoorCameraCount: 0 });
    expect(oversized.find((line) => line.id === "cctv-nvr")).toMatchObject({ profileKey: null, resolution: "unresolved" });
    expect(oversized.find((line) => line.id === "cctv-poe")).toMatchObject({ profileKey: null, resolution: "unresolved" });
  });
  it("uses canonical service units and prevents duplicate infrastructure and commissioning work", () => {
    const result = calculateCctvRequirements(warehouse);
    expect(result.find((line) => line.profileKey === "cctv.install.camera")).toMatchObject({ quantity: 12, unit: "pcs" });
    expect(result.find((line) => line.profileKey === "cctv.install.cable")).toMatchObject({ quantity: 300, unit: "meter" });
    expect(result.find((line) => line.profileKey === "cctv.commissioning.system")).toMatchObject({ quantity: 12, unit: "service" });
    expect(result.find((line) => line.profileKey === "cctv.commissioning.remote")).toMatchObject({ quantity: 1, unit: "service" });
    expect(result.some((line) => line.id === "cctv-install-infrastructure" || line.id === "cctv-commission-recorder")).toBe(false);
  });
});
