import { describe, expect, it } from "vitest";

import { automaticRecorderChannels, calculateCctvRequirements } from "../proposal-generator-calculator";

const warehouse = {
  objectType: "warehouse" as const, indoorCameraCount: 8, indoorResolutionMp: 6 as const,
  outdoorCameraCount: 4, outdoorResolutionMp: 4 as const, recorderSelection: "auto" as const,
  archiveDays: 30, cableLength: 300, installationRequested: true, commissioningRequested: true,
  remoteViewingRequested: true, colorNight: false, licensePlateRecognition: false,
  videoAnalytics: false, backupPower: false,
};

describe("CCTV quick calculator", () => {
  it.each([[2, 4], [6, 8], [12, 16], [24, 32], [33, null]])("sizes %i cameras to the %s-channel governed class", (cameraCount, channels) => {
    expect(automaticRecorderChannels(cameraCount)).toBe(channels);
  });

  it("produces deterministic requirements in the four canonical sections", () => {
    const first = calculateCctvRequirements(warehouse); const second = calculateCctvRequirements(warehouse);
    expect(second).toEqual(first);
    expect(new Set(first.map((line) => line.sectionKey))).toEqual(new Set(["equipment", "installation_materials", "installation_works", "commissioning_works"]));
    expect(first.find((line) => line.profileKey === "cctv.indoor.6mp")?.quantity).toBe(8);
    expect(first.find((line) => line.profileKey === "cctv.outdoor.4mp")?.quantity).toBe(4);
    expect(first.find((line) => line.profileKey === "cctv.cable.cat5e")?.quantity).toBe(300);
    expect(first.find((line) => line.profileKey === "cctv.mounting")).toMatchObject({ quantity: 12, sectionKey: "installation_materials", unit: "pcs" });
  });

  it("respects recorder removal and manual override", () => {
    expect(calculateCctvRequirements({ ...warehouse, recorderSelection: "none" }).some((line) => line.id === "cctv-nvr")).toBe(false);
    expect(calculateCctvRequirements({ ...warehouse, recorderSelection: 8 }).find((line) => line.id === "cctv-nvr")?.profileKey).toBe("cctv.nvr.8");
  });

  it("uses governed recorder PoE capacity and the smallest external switch profile", () => {
    const result = calculateCctvRequirements({ ...warehouse, indoorCameraCount: 6, outdoorCameraCount: 0 }, [
      { profileKey: "cctv.nvr.8", recorderChannels: 8, integratedPoePorts: 4, driveBayCount: 1 },
      { profileKey: "cctv.poe.4", poePortCount: 4 }, { profileKey: "cctv.poe.8", poePortCount: 8 },
      { profileKey: "cctv.storage.8tb", storageCapacityTb: 8 },
    ]);
    expect(result.find((line) => line.id === "cctv-poe")).toMatchObject({ profileKey: "cctv.poe.4", quantity: 1 });
  });

  it("selects governed HDD capacity without always forcing 8 TB and respects drive bays", () => {
    const capabilities = [
      { profileKey: "cctv.nvr.4", recorderChannels: 4, integratedPoePorts: 0, driveBayCount: 1 },
      { profileKey: "cctv.storage.2tb", storageCapacityTb: 2 }, { profileKey: "cctv.storage.4tb", storageCapacityTb: 4 },
      { profileKey: "cctv.storage.8tb", storageCapacityTb: 8 }, { profileKey: "cctv.poe.4", poePortCount: 4 },
    ];
    const twoMp = calculateCctvRequirements({ ...warehouse, indoorCameraCount: 2, indoorResolutionMp: 2, outdoorCameraCount: 0, archiveDays: 7 }, capabilities);
    expect(twoMp.find((line) => line.id === "cctv-storage")?.profileKey).toBe("cctv.storage.2tb");
    const oversized = calculateCctvRequirements({ ...warehouse, indoorCameraCount: 16, indoorResolutionMp: 8, outdoorCameraCount: 0, archiveDays: 90, recorderSelection: 4 }, capabilities);
    expect(oversized.find((line) => line.id === "cctv-storage")).toMatchObject({ profileKey: null, resolution: "unresolved" });
  });

  it("documents storage assumptions without pretending to exact engineering precision", () => {
    expect(calculateCctvRequirements(warehouse).find((line) => line.id === "cctv-storage")?.assumption).toContain("усреднённом профиле записи");
  });

  it("omits installation and commissioning lines when not requested", () => {
    const result = calculateCctvRequirements({ ...warehouse, installationRequested: false, commissioningRequested: false, remoteViewingRequested: false });
    expect(result.some((line) => line.sectionKey === "installation_works" || line.sectionKey === "commissioning_works")).toBe(false);
  });

  it("leaves unsupported recorder capacity unresolved", () => {
    expect(calculateCctvRequirements({ ...warehouse, indoorCameraCount: 33, outdoorCameraCount: 0 }).find((line) => line.id === "cctv-nvr")).toMatchObject({ profileKey: null, resolution: "unresolved" });
  });
});
