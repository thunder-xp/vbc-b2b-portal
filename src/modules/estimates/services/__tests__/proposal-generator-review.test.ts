import { describe, expect, it } from "vitest";
import { calculateCctvConfiguration, type CctvCalculatorInput } from "../proposal-generator-calculator";
import { reviewCctvRequirements } from "../proposal-generator-review";
import type { GeneratorProfileMapping } from "../../repositories/proposal-generator.repository";
const input: CctvCalculatorInput = { objectType: "house", indoorCameraCount: 4, outdoorCameraCount: 4, indoorResolutionMp: 4, outdoorResolutionMp: 4, recorderSelection: "auto", archiveDays: 30, cableLength: 0, installationRequested: false, commissioningRequested: false, remoteViewingRequested: false, colorNight: false, licensePlateRecognition: false, videoAnalytics: false, backupPower: false };
const mappings = [{ profileKey: "cctv.nvr.8", resolution: "catalog", resolvedId: "nvr8", recorderChannels: 8, integratedPoePorts: 8, driveBayCount: 1, maxDriveCapacityTb: 20, compatibilityVerified: true }, { profileKey: "cctv.nvr.16", resolution: "catalog", resolvedId: "nvr16", recorderChannels: 16, integratedPoePorts: 0, driveBayCount: 1, maxDriveCapacityTb: 20, compatibilityVerified: true }, { profileKey: "cctv.storage.8tb", resolution: "catalog", resolvedId: "hdd", storageCapacityTb: 8 }, { profileKey: "cctv.poe.8", resolution: "catalog", resolvedId: "poe", poePortCount: 8 }] as unknown as GeneratorProfileMapping[];
const lines = () => calculateCctvConfiguration(input, mappings).requirements.map((line) => { const mapping = mappings.find((m) => m.profileKey === line.profileKey); return { ...line, resolution: mapping?.resolution ?? line.resolution, resolvedId: mapping?.resolvedId ?? line.resolvedId }; });
describe("edited generator compatibility", () => {
  it("preserves governed automatic NVR/HDD and rechecks actual replacements", () => {
    expect(reviewCctvRequirements(input, lines(), mappings).issues).toEqual([]);
    const edited = lines().map((line) => line.id === "cctv-nvr" ? { ...line, resolvedId: "nvr16" } : line);
    expect(reviewCctvRequirements(input, edited, mappings)).toMatchObject({ recorder: { channels: 16 }, externalPoePortsRequired: 8 });
    expect(reviewCctvRequirements(input, edited, mappings).issues).toContainEqual(expect.objectContaining({ code: "insufficient_poe", severity: "blocking" }));
    edited.push({ ...edited[0], id: "cctv-poe", resolution: "catalog", resolvedId: "poe", quantity: 1 });
    expect(reviewCctvRequirements(input, edited, mappings).issues.some((issue) => issue.severity === "blocking")).toBe(false);
  });
  it("fails closed for unknown recorder/HDD and removed storage", () => {
    for (const id of ["cctv-nvr","cctv-storage"]) {
      const edited = lines().map((line) => line.id === id ? { ...line, resolvedId: "unknown" } : line);
      expect(reviewCctvRequirements(input, edited, mappings).compatibleConfigurationFound).toBe(false);
    }
    expect(reviewCctvRequirements(input, lines().filter((line) => !line.id.startsWith("cctv-storage")), mappings).issues).toContainEqual(expect.objectContaining({ code: "storage_incompatible" }));
  });
});
