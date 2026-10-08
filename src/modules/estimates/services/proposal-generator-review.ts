import { selectCctvCameraCandidates, type CctvCameraCandidate } from "../../cctv-calculation";
import type { GeneratorProfileMapping } from "../repositories/proposal-generator.repository";
import type { GeneratorRequirement } from "./proposal-generator";
import { calculateCctvConfiguration, type CctvCalculatorInput, type CctvConfigurationSummary } from "./proposal-generator-calculator";

// Recheck the actual edited system against governed metadata. Never infer capability from a label/SKU.
export function reviewCctvRequirements(input: CctvCalculatorInput, lines: GeneratorRequirement[], mappings: GeneratorProfileMapping[], cameras?: readonly CctvCameraCandidate[]): CctvConfigurationSummary {
  const parameters = { ...input,
    indoorCameraCount: lines.filter((line) => line.id === "cctv-indoor").reduce((sum, line) => sum + line.quantity, 0),
    outdoorCameraCount: lines.filter((line) => line.id === "cctv-outdoor").reduce((sum, line) => sum + line.quantity, 0),
  };
  const matching = (line: GeneratorRequirement) => mappings.find((mapping) => mapping.resolution === line.resolution && mapping.resolvedId === line.resolvedId && mapping.resolvedId);
  const recorder = lines.find((line) => line.id === "cctv-nvr");
  const recorderMapping = recorder ? mappings.find((mapping) => matching(recorder)?.resolvedId === mapping.resolvedId && mapping.recorderChannels != null) : undefined;
  if (recorderMapping) parameters.recorderSelection = recorderMapping.recorderChannels as CctvCalculatorInput["recorderSelection"];
  else if (!recorder) parameters.recorderSelection = "none";
  const capabilities = recorderMapping ? mappings.filter((mapping) => mapping.recorderChannels == null || mapping === recorderMapping) : mappings.filter((mapping) => mapping.recorderChannels == null);
  const value = calculateCctvConfiguration(parameters, capabilities).compatibility;
  const block = (code: string, message: string) => { if (!value.issues.some((issue) => issue.code === code)) value.issues.push({ severity: "blocking", code, message }); };
  if (recorder && (!recorderMapping || recorder.quantity !== 1)) block("recorder_metadata_unverified", "Сведения о совместимости выбранного регистратора не подтверждены.");
  const storageLines = lines.filter((line) => line.id.startsWith("cctv-storage"));
  const drives = storageLines.map((line) => ({ line, mapping: mappings.find((mapping) => matching(line)?.resolvedId === mapping.resolvedId && mapping.storageCapacityTb != null) }));
  const verifiedDrives = drives.every(({ line, mapping }) => mapping && Number.isInteger(line.quantity) && line.quantity > 0);
  const capacity = verifiedDrives ? drives.reduce((sum, { line, mapping }) => sum + line.quantity * mapping!.storageCapacityTb!, 0) : null;
  const driveCount = drives.reduce((sum, { line }) => sum + line.quantity, 0);
  value.archive.physicalCapacityTb = capacity;
  value.archive.selectedDrives = verifiedDrives ? drives.map(({ line, mapping }) => ({ profileKey: mapping!.profileKey, capacityTb: mapping!.storageCapacityTb!, quantity: line.quantity })) : [];
  if (recorder && (capacity == null || capacity < value.archive.requiredCapacityTb || !recorderMapping?.driveBayCount || driveCount > recorderMapping.driveBayCount || drives.some(({ mapping }) => (mapping?.storageCapacityTb ?? Infinity) > (recorderMapping?.maxDriveCapacityTb ?? 0)))) block("storage_incompatible", "Выбранные накопители не подтверждают требуемую ёмкость архива и совместимость с регистратором.");
  const poeCapacity = lines.filter((line) => line.id === "cctv-poe").reduce((sum, line) => sum + (mappings.find((mapping) => matching(line)?.resolvedId === mapping.resolvedId && mapping.poePortCount != null)?.poePortCount ?? 0) * line.quantity, 0);
  if (poeCapacity < value.externalPoePortsRequired) block("insufficient_poe", "Выбранная сеть PoE не обеспечивает необходимое количество портов.");
  if (cameras) for (const line of lines.filter((line) => line.id === "cctv-indoor" || line.id === "cctv-outdoor")) {
    const kind = line.id === "cctv-indoor" ? "indoor_camera" : "outdoor_camera";
    const resolution = kind === "indoor_camera" ? parameters.indoorResolutionMp : parameters.outdoorResolutionMp;
    if (!selectCctvCameraCandidates(parameters, { kind, cameraResolutionMp: resolution }, cameras).eligible.some((camera) => line.resolution === "catalog" && camera.productId === line.resolvedId)) block(`camera_unverified_${kind}`, "Для выбранной камеры не подтверждены требования к размещению, детализации или дополнительным возможностям.");
  }
  if (!parameters.indoorCameraCount && !parameters.outdoorCameraCount) block("camera_required", "Добавьте хотя бы одну камеру.");
  value.compatibleConfigurationFound = !value.issues.some((issue) => issue.severity === "blocking") && Boolean(recorderMapping);
  return value;
}
