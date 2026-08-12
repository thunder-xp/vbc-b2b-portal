import { describe, expect, it } from "vitest";

import { automaticRecorderChannels, calculateCctvConfiguration, calculateCctvRequirements } from "../proposal-generator-calculator";

const verifiedRecorder = (profileKey: string, channels: number, poe: number, bays: number, maxDrive: number) => ({
  profileKey, recorderChannels: channels, integratedPoePorts: poe, driveBayCount: bays,
  maxDriveCapacityTb: maxDrive, compatibilityVerified: true, resolution: "catalog" as const,
});
const approvedStorage = [2, 4, 6, 8].map((capacity) => ({ profileKey: `cctv.storage.${capacity}tb`, storageCapacityTb: capacity, resolution: "catalog" as const }));

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
      verifiedRecorder("cctv.nvr.8", 8, 4, 1, 8),
      { profileKey: "cctv.poe.4", poePortCount: 4, resolution: "catalog" as const }, { profileKey: "cctv.poe.8", poePortCount: 8, resolution: "catalog" as const },
      ...approvedStorage,
    ]);
    expect(result.find((line) => line.id === "cctv-poe")).toMatchObject({ profileKey: "cctv.poe.4", quantity: 1 });
  });

  it("selects governed HDD capacity without always forcing 8 TB and respects drive bays", () => {
    const capabilities = [
      verifiedRecorder("cctv.nvr.4", 4, 0, 1, 8), ...approvedStorage,
      { profileKey: "cctv.poe.4", poePortCount: 4, resolution: "catalog" as const },
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

  it("fails closed when recorder compatibility metadata is unknown", () => {
    const result = calculateCctvConfiguration({ ...warehouse, indoorCameraCount: 6, outdoorCameraCount: 0 }, [
      { profileKey: "cctv.nvr.8", recorderChannels: 8, resolution: "catalog" }, ...approvedStorage,
    ]);
    expect(result.compatibility.compatibleConfigurationFound).toBe(false);
    expect(result.compatibility.issues).toContainEqual(expect.objectContaining({ severity: "blocking", code: "recorder_metadata_unverified" }));
  });

  it("escalates to a storage-compatible recorder and ranks a mixed HDD plan by minimum excess", () => {
    const result = calculateCctvConfiguration(warehouse, [
      verifiedRecorder("cctv.nvr.16", 16, 0, 1, 8), verifiedRecorder("cctv.nvr.32", 32, 0, 2, 16),
      ...approvedStorage, { profileKey: "cctv.poe.16", poePortCount: 16, resolution: "catalog" },
    ]);
    expect(result.compatibility.recorder.profileKey).toBe("cctv.nvr.32");
    expect(result.compatibility.archive).toMatchObject({ requiredCapacityTb: 12, physicalCapacityTb: 12 });
    expect(result.compatibility.archive.selectedDrives).toEqual([
      { profileKey: "cctv.storage.8tb", capacityTb: 8, quantity: 1 },
      { profileKey: "cctv.storage.4tb", capacityTb: 4, quantity: 1 },
    ]);
  });

  it("blocks a manually selected recorder with too few channels without replacing it", () => {
    const result = calculateCctvConfiguration({ ...warehouse, recorderSelection: 8 }, [
      verifiedRecorder("cctv.nvr.8", 8, 8, 1, 20), ...approvedStorage,
    ]);
    expect(result.compatibility.recorder.profileKey).toBe("cctv.nvr.8");
    expect(result.compatibility.issues).toContainEqual(expect.objectContaining({ severity: "blocking", code: "recorder_channels_insufficient" }));
  });

  it("subtracts integrated PoE and leaves external PoE unresolved above the approved 24-port tier", () => {
    const covered = calculateCctvConfiguration({ ...warehouse, indoorCameraCount: 6, outdoorCameraCount: 0 }, [
      verifiedRecorder("cctv.nvr.8", 8, 8, 1, 20), ...approvedStorage,
    ]);
    expect(covered.requirements.some((line) => line.id === "cctv-poe")).toBe(false);
    const partial = calculateCctvConfiguration({ ...warehouse, indoorCameraCount: 20, outdoorCameraCount: 0, archiveDays: 7 }, [
      verifiedRecorder("cctv.nvr.32", 32, 8, 2, 16), ...approvedStorage,
      { profileKey: "cctv.poe.16", poePortCount: 16, resolution: "catalog" },
    ]);
    expect(partial.compatibility.externalPoePortsRequired).toBe(12);
    expect(partial.requirements.find((line) => line.id === "cctv-poe")?.profileKey).toBe("cctv.poe.16");
  });

  it("never activates the unapproved 12 TB profile", () => {
    const result = calculateCctvConfiguration(warehouse, [
      verifiedRecorder("cctv.nvr.16", 16, 0, 1, 20), ...approvedStorage,
      { profileKey: "cctv.storage.12tb", storageCapacityTb: 12, resolution: "catalog" },
      { profileKey: "cctv.poe.16", poePortCount: 16, resolution: "catalog" },
    ]);
    expect(result.compatibility.archive.selectedDrives).toEqual([]);
    expect(result.compatibility.issues).toContainEqual(expect.objectContaining({ code: "storage_incompatible" }));
  });

  it("does not let stock availability override verified technical compatibility", () => {
    const unavailableButCompatible = { ...verifiedRecorder("cctv.nvr.8", 8, 8, 1, 20), availableStock: 0 };
    const result = calculateCctvConfiguration({ ...warehouse, indoorCameraCount: 6, outdoorCameraCount: 0, archiveDays: 7 }, [
      unavailableButCompatible, ...approvedStorage,
    ]);
    expect(result.compatibility.recorder.profileKey).toBe("cctv.nvr.8");
    expect(result.compatibility.compatibleConfigurationFound).toBe(true);
  });

  it.each([
    { name: "A", cameraCount: 2, recorderSelection: "auto" as const, recorder: "cctv.nvr.4", storage: ["cctv.storage.2tb"], blocking: null },
    { name: "B", cameraCount: 6, recorderSelection: "auto" as const, recorder: "cctv.nvr.8", storage: ["cctv.storage.6tb"], blocking: null },
    { name: "C", cameraCount: 12, recorderSelection: "auto" as const, resolution: 6 as const, recorder: "cctv.nvr.32", storage: ["cctv.storage.8tb", "cctv.storage.6tb"], blocking: null },
    { name: "D", cameraCount: 12, recorderSelection: 8 as const, recorder: "cctv.nvr.8", storage: [], blocking: "recorder_channels_insufficient" },
    { name: "E", cameraCount: 20, recorderSelection: "auto" as const, archiveDays: 7, recorder: "cctv.nvr.32", storage: ["cctv.storage.4tb"], blocking: null },
    { name: "F", cameraCount: 6, recorderSelection: 8 as const, recorder: "cctv.nvr.8", storage: ["cctv.storage.6tb"], blocking: null },
  ])("preserves accepted B2B scenario $name", (scenario) => {
    const result = calculateCctvConfiguration({
      ...warehouse,
      indoorCameraCount: scenario.cameraCount,
      outdoorCameraCount: 0,
      indoorResolutionMp: scenario.resolution ?? 4,
      recorderSelection: scenario.recorderSelection,
      archiveDays: scenario.archiveDays ?? 30,
      cableLength: 100,
    });
    expect(result.compatibility.recorder.profileKey).toBe(scenario.recorder);
    expect(result.compatibility.archive.selectedDrives.map((drive) => drive.profileKey)).toEqual(scenario.storage);
    expect(result.compatibility.issues.find((issue) => issue.severity === "blocking")?.code ?? null).toBe(scenario.blocking);
  });
});
