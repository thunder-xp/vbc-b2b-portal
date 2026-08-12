import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  automaticRecorderChannels,
  calculateCctvTechnicalPlan,
  isPoeCapacitySufficient,
  isRecorderCompatible,
  normalizeCctvInput,
  type CctvPoeProfile,
  type CctvRecorderProfile,
  type CctvStorageProfile,
  type CctvTechnicalConfiguration,
  type CctvTechnicalInput,
} from "..";

const input: CctvTechnicalInput = {
  objectType: "warehouse",
  indoorCameraCount: 8,
  indoorResolutionMp: 6,
  outdoorCameraCount: 4,
  outdoorResolutionMp: 4,
  recorderSelection: "auto",
  archiveDays: 30,
  cableLength: 300,
  installationRequested: true,
  commissioningRequested: true,
  remoteViewingRequested: true,
  colorNight: false,
  licensePlateRecognition: false,
  videoAnalytics: false,
  backupPower: false,
};

const storage = (capacityTb: number, priority = 0): CctvStorageProfile => ({
  kind: "storage",
  profileKey: `storage-${capacityTb}`,
  approvedForAutomaticSelection: true,
  capacityTb,
  priority,
});

const recorder = (overrides: Partial<CctvRecorderProfile> = {}): CctvRecorderProfile => ({
  kind: "recorder",
  profileKey: "recorder-16",
  approvedForAutomaticSelection: true,
  compatibilityVerified: true,
  channels: 16,
  integratedPoePorts: 8,
  driveBayCount: 2,
  maxDriveCapacityTb: 8,
  ...overrides,
});

const poe = (portCapacity: number): CctvPoeProfile => ({
  kind: "poe",
  profileKey: `poe-${portCapacity}`,
  approvedForAutomaticSelection: true,
  portCapacity,
  priority: 0,
});

describe("shared CCTV technical engine", () => {
  it("has no Estimates, React, persistence, network, 1C, or commercial dependency", () => {
    const source = readFileSync(resolve("src/modules/cctv-calculation/cctv-engine.ts"), "utf8");
    expect(source).not.toMatch(/from\s+["'][^"']*(estimates|supabase|react|next|integration)/i);
    expect(source).not.toMatch(/fetch\s*\(|price|margin|vat|companyId|partner_final_customers|PartnerOrder|1C/i);
  });

  it("normalizes into a copy and rejects invalid bounded or non-boolean values", () => {
    const normalized = normalizeCctvInput(input);
    expect(normalized).toEqual(input);
    expect(normalized).not.toBe(input);
    expect(() => normalizeCctvInput({ ...input, indoorCameraCount: 129 })).toThrow();
    expect(() => normalizeCctvInput({ ...input, installationRequested: "yes" as unknown as boolean })).toThrow();
  });

  it.each([[1, 4], [4, 4], [5, 8], [9, 16], [17, 32], [33, null]])(
    "maps %i cameras to the governed %s-channel class",
    (cameraCount, channels) => expect(automaticRecorderChannels(cameraCount)).toBe(channels),
  );

  it("is deterministic and emits structured explanation evidence without UI copy", () => {
    const first = calculateCctvTechnicalPlan(input);
    expect(calculateCctvTechnicalPlan(input)).toEqual(first);
    expect(first.decisions).toContainEqual({ code: "recorder_minimum_channels", cameraCount: 12, requiredClass: 16 });
    expect(first.decisions).toContainEqual(expect.objectContaining({ code: "storage_capacity_calculated", requiredCapacityTb: 12 }));
    expect(JSON.stringify(first.compatibility.issues)).not.toMatch(/[А-Яа-яЁё]/);
  });

  it("ranks HDD combinations by minimum excess, fewer drives, then governed priority", () => {
    const configuration: CctvTechnicalConfiguration = {
      version: "test-v1",
      profiles: [
        recorder({ integratedPoePorts: 16 }),
        storage(4, 50),
        storage(6, 1),
        storage(8, 1),
      ],
    };
    const result = calculateCctvTechnicalPlan(input, configuration);
    expect(result.configurationVersion).toBe("test-v1");
    expect(result.compatibility.archive).toMatchObject({ requiredCapacityTb: 12, physicalCapacityTb: 12 });
    expect(result.compatibility.archive.selectedDrives).toEqual([
      { profileKey: "storage-6", capacityTb: 6, quantity: 2 },
    ]);
  });

  it("fails closed for unknown recorder metadata and preserves a manual incompatible class", () => {
    const configuration: CctvTechnicalConfiguration = {
      version: null,
      profiles: [recorder({ compatibilityVerified: false }), storage(8)],
    };
    const unknown = calculateCctvTechnicalPlan({ ...input, indoorCameraCount: 6, outdoorCameraCount: 0 }, configuration);
    expect(unknown.compatibility.ready).toBe(false);
    expect(unknown.compatibility.issues).toContainEqual(expect.objectContaining({ code: "recorder_metadata_unverified" }));

    const manual = calculateCctvTechnicalPlan({ ...input, recorderSelection: 8 });
    expect(manual.compatibility.recorder.profileKey).toBe("cctv.nvr.8");
    expect(manual.compatibility.issues).toContainEqual(expect.objectContaining({ code: "recorder_channels_insufficient", selectedChannels: 8 }));
  });

  it("selects the smallest sufficient external PoE profile and exposes reusable compatibility checks", () => {
    const result = calculateCctvTechnicalPlan({ ...input, indoorCameraCount: 20, outdoorCameraCount: 0, archiveDays: 7 });
    expect(result.compatibility.poe).toMatchObject({ externalPortsRequired: 20, selectedProfileKey: "cctv.poe.24", selectedPortCapacity: 24 });
    expect(isPoeCapacitySufficient(20, poe(24))).toBe(true);
    expect(isPoeCapacitySufficient(20, poe(16))).toBe(false);
    expect(isRecorderCompatible(12, 12, recorder(), [storage(4), storage(8)])).toBe(true);
    expect(isRecorderCompatible(20, 12, recorder(), [storage(4), storage(8)])).toBe(false);
  });

  it("returns technical work quantities without prices or tariffs", () => {
    const result = calculateCctvTechnicalPlan(input);
    expect(result.requirements).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "camera_installation", quantity: 12, unit: "pieces" }),
      expect.objectContaining({ kind: "cable_laying", quantity: 300, unit: "meters" }),
      expect.objectContaining({ kind: "commissioning", quantity: 12, unit: "service" }),
      expect.objectContaining({ kind: "remote_configuration", quantity: 1, unit: "service" }),
    ]));
    expect(JSON.stringify(result.requirements)).not.toMatch(/price|tariff|amount|currency|margin|vat/i);
  });

  it("does not let unapproved profiles or stock-like data override compatibility", () => {
    const configuration: CctvTechnicalConfiguration = {
      version: null,
      profiles: [
        recorder(),
        { ...storage(12), approvedForAutomaticSelection: false },
        storage(8),
        { ...poe(16), approvedForAutomaticSelection: false },
      ],
    };
    const result = calculateCctvTechnicalPlan(input, configuration);
    expect(result.compatibility.archive.selectedDrives).toEqual([
      { profileKey: "storage-8", capacityTb: 8, quantity: 2 },
    ]);
    expect(result.compatibility.poe.selectedProfileKey).toBeNull();
  });
});
