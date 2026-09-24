export type CampaignActionResult<T> =
  | { success: true; data: T; message: string }
  | { success: false; data: null; message: string; correlationId: string; errorCode?: string; issues?: import("../campaign-draft.contract").CampaignValidationIssue[] };

export function campaignSuccess<T>(data: T, message: string): CampaignActionResult<T> {
  return { success: true, data, message };
}

export function campaignFailure<T>(message: string, correlationId: string, options?: { errorCode?: string; issues?: import("../campaign-draft.contract").CampaignValidationIssue[] }): CampaignActionResult<T> {
  return { success: false, data: null, message, correlationId, ...options };
}
