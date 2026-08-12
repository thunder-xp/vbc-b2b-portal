export const CCTV_OBJECT_TYPES = [
  "apartment", "house", "office", "retail", "warehouse", "industrial", "horeca", "other",
] as const;
export const CCTV_CAMERA_RESOLUTIONS = [2, 4, 6, 8] as const;
export const CCTV_RECORDER_CHANNELS = [4, 8, 16, 32] as const;
export const CCTV_POE_CAPACITIES = [4, 8, 16, 24, 32] as const;
export const CCTV_STORAGE_CAPACITIES_TB = [1, 2, 4, 6, 8, 12] as const;

export type CctvObjectType = (typeof CCTV_OBJECT_TYPES)[number];
export type CctvCameraResolution = (typeof CCTV_CAMERA_RESOLUTIONS)[number];
export type CctvRecorderChannelClass = (typeof CCTV_RECORDER_CHANNELS)[number];
export type CctvRecorderSelection = "auto" | "none" | CctvRecorderChannelClass;

export type CctvTechnicalInput = {
  objectType: CctvObjectType;
  indoorCameraCount: number;
  indoorResolutionMp: CctvCameraResolution;
  outdoorCameraCount: number;
  outdoorResolutionMp: CctvCameraResolution;
  recorderSelection: CctvRecorderSelection;
  archiveDays: number;
  cableLength: number;
  installationRequested: boolean;
  commissioningRequested: boolean;
  remoteViewingRequested: boolean;
  colorNight: boolean;
  licensePlateRecognition: boolean;
  videoAnalytics: boolean;
  backupPower: boolean;
};

export type CctvProfileKey =
  | `cctv.indoor.${CctvCameraResolution}mp`
  | `cctv.outdoor.${CctvCameraResolution}mp`
  | `cctv.nvr.${CctvRecorderChannelClass}`
  | `cctv.storage.${(typeof CCTV_STORAGE_CAPACITIES_TB)[number]}tb`
  | `cctv.poe.${(typeof CCTV_POE_CAPACITIES)[number]}`
  | "cctv.cable.cat5e"
  | "cctv.mounting"
  | "cctv.ups"
  | "cctv.install.camera"
  | "cctv.install.cable"
  | "cctv.commissioning.system"
  | "cctv.commissioning.remote";

export type CctvRecorderProfile = {
  kind: "recorder";
  profileKey: string;
  approvedForAutomaticSelection: boolean;
  compatibilityVerified: boolean;
  channels: number;
  integratedPoePorts: number | null;
  driveBayCount: number | null;
  maxDriveCapacityTb: number | null;
};

export type CctvStorageProfile = {
  kind: "storage";
  profileKey: string;
  approvedForAutomaticSelection: boolean;
  capacityTb: number;
  priority: number;
};

export type CctvPoeProfile = {
  kind: "poe";
  profileKey: string;
  approvedForAutomaticSelection: boolean;
  portCapacity: number;
  priority: number;
};

export type CctvTechnicalProfile = CctvRecorderProfile | CctvStorageProfile | CctvPoeProfile;

export type CctvTechnicalConfiguration = {
  version: string | null;
  profiles: readonly CctvTechnicalProfile[];
};

export type CctvRequirementSection = "equipment" | "materials" | "installation" | "commissioning";
export type CctvRequirementUnit = "pieces" | "meters" | "service";
export type CctvTechnicalRequirementKind =
  | "indoor_camera"
  | "outdoor_camera"
  | "recorder"
  | "storage"
  | "external_poe"
  | "backup_power"
  | "cable"
  | "mounting_material"
  | "camera_installation"
  | "cable_laying"
  | "commissioning"
  | "remote_configuration";

export type CctvTechnicalRequirement = {
  id: string;
  kind: CctvTechnicalRequirementKind;
  profileKey: CctvProfileKey | null;
  section: CctvRequirementSection;
  quantity: number;
  unit: CctvRequirementUnit;
  cameraResolutionMp?: CctvCameraResolution;
  recorderChannels?: number;
  storageCapacityTb?: number;
  requiredStorageTb?: number;
  poePortCapacity?: number;
  integratedPoePorts?: number;
};

export type CctvTechnicalIssue =
  | { severity: "warning"; code: "recorder_not_selected" }
  | { severity: "warning"; code: "recorder_above_recommended_tier"; selectedChannels: number; recommendedChannels: number }
  | { severity: "warning"; code: "insufficient_poe"; requiredPorts: number }
  | { severity: "blocking"; code: "recorder_channels_insufficient"; cameraCount: number; selectedChannels: number }
  | { severity: "blocking"; code: "recorder_metadata_unverified"; selectedProfileKey: string | null }
  | { severity: "blocking"; code: "storage_incompatible"; requiredCapacityTb: number; selectedProfileKey: string | null };

export type CctvDecisionEvidence =
  | { code: "camera_count"; total: number; indoor: number; outdoor: number }
  | { code: "recorder_minimum_channels"; cameraCount: number; requiredClass: CctvRecorderChannelClass | null }
  | { code: "storage_capacity_calculated"; requiredCapacityTb: number; archiveDays: number; megapixelLoad: number }
  | { code: "storage_plan_selected"; physicalCapacityTb: number | null; driveCount: number }
  | { code: "poe_ports_calculated"; cameraCount: number; integratedPorts: number; externalPorts: number }
  | { code: "work_quantities_calculated"; cameraInstallation: number; cableLayingMeters: number; commissioning: number; remoteConfiguration: number };

export type CctvStorageSelection = { profileKey: string; capacityTb: number; quantity: number };

export type CctvTechnicalResult = {
  normalizedInput: Readonly<CctvTechnicalInput>;
  configurationVersion: string | null;
  requirements: CctvTechnicalRequirement[];
  decisions: CctvDecisionEvidence[];
  compatibility: {
    ready: boolean;
    automaticRecorderProfile: string | null;
    recorder: {
      profileKey: string | null;
      channels: number | null;
      driveBayCount: number | null;
      maxDriveCapacityTb: number | null;
      integratedPoePorts: number | null;
    };
    archive: {
      requiredCapacityTb: number;
      selectedDrives: CctvStorageSelection[];
      physicalCapacityTb: number | null;
    };
    poe: {
      externalPortsRequired: number;
      selectedProfileKey: string | null;
      selectedPortCapacity: number | null;
    };
    issues: CctvTechnicalIssue[];
  };
};

type StoragePlan = {
  drives: CctvStorageSelection[];
  physicalCapacityTb: number;
  excessTb: number;
  driveCount: number;
  priority: number;
};

type RecorderChoice = {
  profile: CctvRecorderProfile | null;
  storagePlan: StoragePlan | null;
  issue: CctvTechnicalIssue | null;
};

export const DEFAULT_CCTV_TECHNICAL_CONFIGURATION: CctvTechnicalConfiguration = {
  version: "default-v1",
  profiles: [
    recorder("cctv.nvr.4", 4, 4, 1, 8),
    recorder("cctv.nvr.8", 8, 8, 1, 20),
    recorder("cctv.nvr.16", 16, 0, 1, 20),
    recorder("cctv.nvr.32", 32, 0, 2, 16),
    ...CCTV_POE_CAPACITIES.filter((ports) => ports !== 32).map((ports) => ({
      kind: "poe" as const,
      profileKey: `cctv.poe.${ports}`,
      approvedForAutomaticSelection: true,
      portCapacity: ports,
      priority: 0,
    })),
    ...CCTV_STORAGE_CAPACITIES_TB.filter((capacity) => capacity !== 1 && capacity !== 12).map((capacity) => ({
      kind: "storage" as const,
      profileKey: `cctv.storage.${capacity}tb`,
      approvedForAutomaticSelection: true,
      capacityTb: capacity,
      priority: 0,
    })),
  ],
};

export function calculateCctvTechnicalPlan(
  rawInput: CctvTechnicalInput,
  configuration: CctvTechnicalConfiguration = DEFAULT_CCTV_TECHNICAL_CONFIGURATION,
): CctvTechnicalResult {
  const input = normalizeCctvInput(rawInput);
  const cameraCount = input.indoorCameraCount + input.outdoorCameraCount;
  if (cameraCount === 0) return emptyResult(input, configuration.version);

  const megapixelLoad = input.indoorCameraCount * input.indoorResolutionMp
    + input.outdoorCameraCount * input.outdoorResolutionMp;
  const recordingMultiplier = (input.colorNight ? 1.2 : 1) * (input.videoAnalytics ? 1.1 : 1);
  const requiredStorageTb = Math.max(1, Math.ceil(((megapixelLoad / 4) * input.archiveDays * 24 * recordingMultiplier) / 1000));
  const minimumChannels = automaticRecorderChannels(cameraCount);
  const recorderProfiles = configuration.profiles.filter((profile): profile is CctvRecorderProfile => profile.kind === "recorder");
  const storageProfiles = configuration.profiles.filter((profile): profile is CctvStorageProfile => profile.kind === "storage" && profile.approvedForAutomaticSelection);
  const recorderChoice = selectRecorder(input.recorderSelection, cameraCount, requiredStorageTb, recorderProfiles, storageProfiles);
  const recorderProfile = recorderChoice.profile;
  const storagePlan = recorderChoice.storagePlan;
  const recorderChannels = recorderProfile?.channels ?? (input.recorderSelection === "none" ? null : minimumChannels);
  const issues: CctvTechnicalIssue[] = recorderChoice.issue ? [recorderChoice.issue] : [];

  if (input.recorderSelection === "none") issues.push({ severity: "warning", code: "recorder_not_selected" });
  if (typeof input.recorderSelection === "number" && minimumChannels && input.recorderSelection > minimumChannels) {
    issues.push({ severity: "warning", code: "recorder_above_recommended_tier", selectedChannels: input.recorderSelection, recommendedChannels: minimumChannels });
  }

  const integratedPoePorts = recorderProfile?.integratedPoePorts ?? 0;
  const externalPoePorts = Math.max(0, cameraCount - integratedPoePorts);
  const poeProfile = selectPoeProfile(externalPoePorts, configuration.profiles);
  if (externalPoePorts > 0 && !poeProfile) issues.push({ severity: "warning", code: "insufficient_poe", requiredPorts: externalPoePorts });

  const requirements = buildRequirements(input, cameraCount, recorderProfile, recorderChannels, storagePlan, requiredStorageTb, externalPoePorts, poeProfile);
  const physicalCapacityTb = storagePlan?.physicalCapacityTb ?? null;
  const decisions: CctvDecisionEvidence[] = [
    { code: "camera_count", total: cameraCount, indoor: input.indoorCameraCount, outdoor: input.outdoorCameraCount },
    { code: "recorder_minimum_channels", cameraCount, requiredClass: minimumChannels },
    { code: "storage_capacity_calculated", requiredCapacityTb: requiredStorageTb, archiveDays: input.archiveDays, megapixelLoad },
    { code: "storage_plan_selected", physicalCapacityTb, driveCount: storagePlan?.driveCount ?? 0 },
    { code: "poe_ports_calculated", cameraCount, integratedPorts: integratedPoePorts, externalPorts: externalPoePorts },
    { code: "work_quantities_calculated", cameraInstallation: input.installationRequested ? cameraCount : 0,
      cableLayingMeters: input.installationRequested ? input.cableLength : 0,
      commissioning: input.commissioningRequested ? cameraCount : 0,
      remoteConfiguration: input.remoteViewingRequested ? 1 : 0 },
  ];

  return {
    normalizedInput: input,
    configurationVersion: configuration.version,
    requirements: requirements.slice(0, 30),
    decisions,
    compatibility: {
      ready: input.recorderSelection !== "none" && Boolean(recorderProfile && storagePlan)
        && !issues.some((issue) => issue.severity === "blocking"),
      automaticRecorderProfile: input.recorderSelection === "auto" ? recorderProfile?.profileKey ?? null : null,
      recorder: {
        profileKey: recorderProfile?.profileKey ?? null,
        channels: recorderProfile?.channels ?? null,
        driveBayCount: recorderProfile?.driveBayCount ?? null,
        maxDriveCapacityTb: recorderProfile?.maxDriveCapacityTb ?? null,
        integratedPoePorts: recorderProfile?.integratedPoePorts ?? null,
      },
      archive: { requiredCapacityTb: requiredStorageTb, selectedDrives: storagePlan?.drives ?? [], physicalCapacityTb },
      poe: {
        externalPortsRequired: externalPoePorts,
        selectedProfileKey: poeProfile?.profileKey ?? null,
        selectedPortCapacity: poeProfile?.portCapacity ?? null,
      },
      issues,
    },
  };
}

export function normalizeCctvInput(input: CctvTechnicalInput): Readonly<CctvTechnicalInput> {
  if (!CCTV_OBJECT_TYPES.includes(input.objectType)) throw new Error("Invalid CCTV object type.");
  if (!CCTV_CAMERA_RESOLUTIONS.includes(input.indoorResolutionMp)
    || !CCTV_CAMERA_RESOLUTIONS.includes(input.outdoorResolutionMp)
    || !(input.recorderSelection === "auto" || input.recorderSelection === "none" || CCTV_RECORDER_CHANNELS.includes(input.recorderSelection))) {
    throw new Error("Invalid CCTV camera or recorder parameters.");
  }
  const integerFields = [input.indoorCameraCount, input.outdoorCameraCount, input.archiveDays, input.cableLength];
  const booleanFields = [input.installationRequested, input.commissioningRequested, input.remoteViewingRequested,
    input.colorNight, input.licensePlateRecognition, input.videoAnalytics, input.backupPower];
  if (!integerFields.every(Number.isInteger) || !booleanFields.every((value) => typeof value === "boolean")
    || input.indoorCameraCount < 0 || input.indoorCameraCount > 128
    || input.outdoorCameraCount < 0 || input.outdoorCameraCount > 128
    || input.archiveDays < 1 || input.archiveDays > 365
    || input.cableLength < 0 || input.cableLength > 20000) {
    throw new Error("CCTV calculation parameters are outside allowed bounds.");
  }
  return { ...input };
}

export function automaticRecorderChannels(cameraCount: number): CctvRecorderChannelClass | null {
  return CCTV_RECORDER_CHANNELS.find((channels) => cameraCount <= channels) ?? null;
}

export function isRecorderCompatible(
  cameraCount: number,
  requiredStorageTb: number,
  recorderProfile: CctvRecorderProfile,
  storageProfiles: readonly CctvStorageProfile[],
): boolean {
  return recorderProfile.channels >= cameraCount && isVerifiedRecorder(recorderProfile)
    && selectStoragePlan(requiredStorageTb, recorderProfile.driveBayCount!, recorderProfile.maxDriveCapacityTb!, storageProfiles) !== null;
}

export function isPoeCapacitySufficient(requiredExternalPorts: number, profile: CctvPoeProfile): boolean {
  return profile.approvedForAutomaticSelection && profile.portCapacity >= requiredExternalPorts;
}

function buildRequirements(
  input: Readonly<CctvTechnicalInput>,
  cameraCount: number,
  recorderProfile: CctvRecorderProfile | null,
  recorderChannels: number | null,
  storagePlan: StoragePlan | null,
  requiredStorageTb: number,
  externalPoePorts: number,
  poeProfile: CctvPoeProfile | null,
): CctvTechnicalRequirement[] {
  const requirements: CctvTechnicalRequirement[] = [];
  if (input.indoorCameraCount) requirements.push({ id: "cctv-indoor", kind: "indoor_camera", profileKey: `cctv.indoor.${input.indoorResolutionMp}mp`, section: "equipment", quantity: input.indoorCameraCount, unit: "pieces", cameraResolutionMp: input.indoorResolutionMp });
  if (input.outdoorCameraCount) requirements.push({ id: "cctv-outdoor", kind: "outdoor_camera", profileKey: `cctv.outdoor.${input.outdoorResolutionMp}mp`, section: "equipment", quantity: input.outdoorCameraCount, unit: "pieces", cameraResolutionMp: input.outdoorResolutionMp });
  if (input.recorderSelection !== "none") requirements.push({ id: "cctv-nvr", kind: "recorder", profileKey: asProfileKey(recorderProfile?.profileKey), section: "equipment", quantity: 1, unit: "pieces", ...(recorderChannels == null ? {} : { recorderChannels }) });
  if (storagePlan) storagePlan.drives.forEach((drive, index) => requirements.push({ id: index === 0 ? "cctv-storage" : `cctv-storage-${index + 1}`, kind: "storage", profileKey: asProfileKey(drive.profileKey), section: "equipment", quantity: drive.quantity, unit: "pieces", storageCapacityTb: drive.capacityTb, requiredStorageTb }));
  else requirements.push({ id: "cctv-storage", kind: "storage", profileKey: null, section: "equipment", quantity: 1, unit: "pieces", requiredStorageTb });
  if (externalPoePorts > 0) requirements.push({ id: "cctv-poe", kind: "external_poe", profileKey: asProfileKey(poeProfile?.profileKey), section: "equipment", quantity: 1, unit: "pieces", poePortCapacity: poeProfile?.portCapacity ?? externalPoePorts, ...(recorderProfile?.integratedPoePorts ? { integratedPoePorts: recorderProfile.integratedPoePorts } : {}) });
  if (input.backupPower) requirements.push({ id: "cctv-ups", kind: "backup_power", profileKey: "cctv.ups", section: "equipment", quantity: 1, unit: "pieces" });
  if (input.cableLength > 0) {
    requirements.push({ id: "cctv-cable", kind: "cable", profileKey: "cctv.cable.cat5e", section: "materials", quantity: input.cableLength, unit: "meters" });
    requirements.push({ id: "cctv-mounting", kind: "mounting_material", profileKey: "cctv.mounting", section: "materials", quantity: cameraCount, unit: "pieces" });
  }
  if (input.installationRequested) {
    requirements.push({ id: "cctv-install-camera", kind: "camera_installation", profileKey: "cctv.install.camera", section: "installation", quantity: cameraCount, unit: "pieces" });
    if (input.cableLength > 0) requirements.push({ id: "cctv-install-cable", kind: "cable_laying", profileKey: "cctv.install.cable", section: "installation", quantity: input.cableLength, unit: "meters" });
  }
  if (input.commissioningRequested) requirements.push({ id: "cctv-commission-system", kind: "commissioning", profileKey: "cctv.commissioning.system", section: "commissioning", quantity: cameraCount, unit: "service" });
  if (input.remoteViewingRequested) requirements.push({ id: "cctv-commission-remote", kind: "remote_configuration", profileKey: "cctv.commissioning.remote", section: "commissioning", quantity: 1, unit: "service" });
  return requirements;
}

function selectRecorder(
  selection: CctvRecorderSelection,
  cameraCount: number,
  requiredStorageTb: number,
  recorders: readonly CctvRecorderProfile[],
  storage: readonly CctvStorageProfile[],
): RecorderChoice {
  if (selection === "none") return { profile: null, storagePlan: null, issue: null };
  const candidates = recorders.filter((profile) => selection === "auto" || profile.channels === selection)
    .sort((left, right) => left.channels - right.channels);
  if (selection !== "auto" && selection < cameraCount) return {
    profile: candidates[0] ?? null,
    storagePlan: null,
    issue: { severity: "blocking", code: "recorder_channels_insufficient", cameraCount, selectedChannels: selection },
  };
  for (const candidate of candidates) {
    if (candidate.channels < cameraCount || !isVerifiedRecorder(candidate)) continue;
    const storagePlan = selectStoragePlan(requiredStorageTb, candidate.driveBayCount!, candidate.maxDriveCapacityTb!, storage);
    if (storagePlan) return { profile: candidate, storagePlan, issue: null };
  }
  if (selection === "auto" && candidates.some((candidate) => candidate.channels >= cameraCount)
    && !candidates.some((candidate) => candidate.channels >= cameraCount && isVerifiedRecorder(candidate))) {
    return { profile: null, storagePlan: null, issue: { severity: "blocking", code: "recorder_metadata_unverified", selectedProfileKey: null } };
  }
  const selected = selection === "auto" ? null : candidates[0] ?? null;
  if (selected && !isVerifiedRecorder(selected)) return {
    profile: selected,
    storagePlan: null,
    issue: { severity: "blocking", code: "recorder_metadata_unverified", selectedProfileKey: selected.profileKey },
  };
  return {
    profile: selected,
    storagePlan: null,
    issue: { severity: "blocking", code: "storage_incompatible", requiredCapacityTb: requiredStorageTb, selectedProfileKey: selected?.profileKey ?? null },
  };
}

function selectStoragePlan(
  requiredTb: number,
  driveBayCount: number,
  maxDriveCapacityTb: number,
  profiles: readonly CctvStorageProfile[],
): StoragePlan | null {
  const drives = profiles.filter((profile) => profile.approvedForAutomaticSelection && profile.capacityTb > 0 && profile.capacityTb <= maxDriveCapacityTb)
    .sort((left, right) => left.capacityTb - right.capacityTb);
  const plans: StoragePlan[] = [];
  const visit = (start: number, remainingBays: number, selected: CctvStorageProfile[]) => {
    if (selected.length) {
      const physicalCapacityTb = selected.reduce((sum, drive) => sum + drive.capacityTb, 0);
      if (physicalCapacityTb >= requiredTb) {
        const grouped = new Map<string, CctvStorageSelection>();
        selected.forEach((drive) => grouped.set(drive.profileKey, { profileKey: drive.profileKey, capacityTb: drive.capacityTb, quantity: (grouped.get(drive.profileKey)?.quantity ?? 0) + 1 }));
        plans.push({ drives: [...grouped.values()].sort((left, right) => right.capacityTb - left.capacityTb), physicalCapacityTb,
          excessTb: physicalCapacityTb - requiredTb, driveCount: selected.length,
          priority: selected.reduce((sum, drive) => sum + drive.priority, 0) });
        return;
      }
    }
    if (!remainingBays) return;
    for (let index = start; index < drives.length; index += 1) visit(index, remainingBays - 1, [...selected, drives[index]]);
  };
  visit(0, driveBayCount, []);
  return plans.sort((left, right) => left.excessTb - right.excessTb || left.driveCount - right.driveCount || left.priority - right.priority)[0] ?? null;
}

function selectPoeProfile(requiredPorts: number, profiles: readonly CctvTechnicalProfile[]): CctvPoeProfile | null {
  if (requiredPorts <= 0) return null;
  return profiles.filter((profile): profile is CctvPoeProfile => profile.kind === "poe" && isPoeCapacitySufficient(requiredPorts, profile))
    .sort((left, right) => left.portCapacity - right.portCapacity || left.priority - right.priority)[0] ?? null;
}

function isVerifiedRecorder(profile: CctvRecorderProfile): boolean {
  return profile.approvedForAutomaticSelection && profile.compatibilityVerified && profile.channels > 0
    && profile.integratedPoePorts != null && profile.driveBayCount != null && profile.driveBayCount > 0
    && profile.maxDriveCapacityTb != null && profile.maxDriveCapacityTb > 0;
}

function recorder(profileKey: string, channels: number, integratedPoePorts: number, driveBayCount: number, maxDriveCapacityTb: number): CctvRecorderProfile {
  return { kind: "recorder", profileKey, approvedForAutomaticSelection: true, compatibilityVerified: true,
    channels, integratedPoePorts, driveBayCount, maxDriveCapacityTb };
}

function asProfileKey(value: string | null | undefined): CctvProfileKey | null {
  return value ? value as CctvProfileKey : null;
}

function emptyResult(input: Readonly<CctvTechnicalInput>, version: string | null): CctvTechnicalResult {
  return {
    normalizedInput: input,
    configurationVersion: version,
    requirements: [],
    decisions: [],
    compatibility: {
      ready: false,
      automaticRecorderProfile: null,
      recorder: { profileKey: null, channels: null, driveBayCount: null, maxDriveCapacityTb: null, integratedPoePorts: null },
      archive: { requiredCapacityTb: 0, selectedDrives: [], physicalCapacityTb: null },
      poe: { externalPortsRequired: 0, selectedProfileKey: null, selectedPortCapacity: null },
      issues: [],
    },
  };
}
