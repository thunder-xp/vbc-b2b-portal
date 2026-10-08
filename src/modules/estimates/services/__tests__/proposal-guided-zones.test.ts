import { describe, expect, it } from "vitest";
import { CCTV_OBJECT_TYPES, calculateCctvConfiguration } from "../proposal-generator-calculator";
import { createGuidedZone, guidedPointCounts, guidedZoneFacts, suggestedGuidedZones, translateGuidedZones, type GuidedZoneRequirements } from "../proposal-guided-zones";
const draft = (): GuidedZoneRequirements => ({ objectType: "house", zones: [], system: { indoorResolutionMp: 4, outdoorResolutionMp: 4, recorderSelection: "auto", archiveDays: 30, cableLength: 0, installationRequested: true, commissioningRequested: true, remoteViewingRequested: false, colorNight: false, licensePlateRecognition: false, videoAnalytics: false, backupPower: false } });
describe("guided requirements adapter", () => {
  it.each(CCTV_OBJECT_TYPES)("supports %s without choosing products or forcing zones", (objectType) => {
    const input = { ...draft(), objectType, zones: [createGuidedZone("entrance", "entry")] };
    expect(translateGuidedZones(input).objectType).toBe(objectType);
    expect(suggestedGuidedZones(objectType).length).toBeGreaterThan(0);
    expect(input.zones).toHaveLength(1);
    expect(JSON.stringify(suggestedGuidedZones(objectType))).not.toMatch(/"(?:sku|productId|price)"/i);
  });
  it("aggregates quantities, custom zones and deletion without per-zone products", () => {
    const zones = [{ ...createGuidedZone("entrance", "1"), quantity: 3 }, { ...createGuidedZone("parking", "2"), quantity: 4 }, { ...createGuidedZone("custom", "3"), label: "Private customer name", quantity: 2 }];
    expect(guidedPointCounts(zones)).toEqual({ indoorCameraCount: 5, outdoorCameraCount: 4 });
    expect(guidedPointCounts(zones.filter((zone) => zone.id !== "1"))).toEqual({ indoorCameraCount: 2, outdoorCameraCount: 4 });
    expect(JSON.stringify(guidedZoneFacts({ ...draft(), zones }))).not.toContain("Private customer name");
  });
  it("blocks zero points and invalid/overflow quantities", () => {
    expect(() => translateGuidedZones(draft())).toThrow();
    for (const quantity of [-1, 0.5, 129, NaN]) expect(() => translateGuidedZones({ ...draft(), zones: [{ ...createGuidedZone("inside", "1"), quantity }] })).toThrow();
  });
  it("does not infer advanced requirements from gates or object types", () => {
    const input = { ...draft(), zones: [createGuidedZone("gate", "1")] };
    expect(translateGuidedZones(input)).toMatchObject({ licensePlateRecognition: false, videoAnalytics: false, colorNight: false, cableLength: 0 });
    input.zones[0].licensePlateRecognition = true; input.zones[0].videoAnalytics = true; input.zones[0].colorNight = true;
    expect(translateGuidedZones(input)).toMatchObject({ licensePlateRecognition: true, videoAnalytics: true, colorNight: true });
    input.zones[0].quantity = 0; input.zones.push(createGuidedZone("inside", "2"));
    expect(translateGuidedZones(input).licensePlateRecognition).toBe(false);
  });
  it.each([7,14,30,60,90])("retains %s days, automatic NVR and canonical HDD/PoE sizing", (archiveDays) => {
    const input = draft(); input.system.archiveDays = archiveDays; input.zones = [{ ...createGuidedZone("inside", "1"), quantity: 8 }, { ...createGuidedZone("perimeter", "2"), quantity: 4 }];
    const translated = translateGuidedZones(input);
    expect(translated.archiveDays).toBe(archiveDays); expect(translated.recorderSelection).toBe("auto");
    expect(calculateCctvConfiguration(translated)).toEqual(calculateCctvConfiguration({ ...input.system, objectType: "house", indoorCameraCount: 8, outdoorCameraCount: 4 }));
  });
});
