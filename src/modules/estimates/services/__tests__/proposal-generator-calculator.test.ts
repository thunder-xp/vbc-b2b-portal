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
    expect(first.find((line) => line.profileKey === "cctv.cable")?.quantity).toBe(300);
  });
  it("keeps every derived identity unresolved until an exact profile mapping exists", () => {
    expect(calculateCctvRequirements(warehouse).every((line) => line.resolution === "unresolved" && line.resolvedId === null)).toBe(true);
  });
  it("documents storage assumptions without pretending to exact engineering precision", () => {
    const storage = calculateCctvRequirements(warehouse).find((line) => line.profileKey === "cctv.storage");
    expect(storage?.assumption).toContain("усреднённом профиле записи");
  });
  it("omits installation and commissioning lines when not requested", () => {
    const result = calculateCctvRequirements({ ...warehouse, installationRequested: false, commissioningRequested: false, remoteViewingRequested: false });
    expect(result.some((line) => line.sectionKey === "installation_works" || line.sectionKey === "commissioning_works")).toBe(false);
  });
});
