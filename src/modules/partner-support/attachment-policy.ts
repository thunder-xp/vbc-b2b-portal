import { hasValidServiceFileSignature } from "@/src/modules/service-attachments/policy";

export const SUPPORT_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;
export const SUPPORT_ATTACHMENT_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const hasValidSupportFileSignature = hasValidServiceFileSignature;
