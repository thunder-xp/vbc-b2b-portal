export type CampaignActionResult<T> =
  | { success: true; data: T; message: string }
  | { success: false; data: null; message: string; correlationId: string };

export function campaignSuccess<T>(data: T, message: string): CampaignActionResult<T> {
  return { success: true, data, message };
}

export function campaignFailure<T>(message: string, correlationId: string): CampaignActionResult<T> {
  return { success: false, data: null, message, correlationId };
}
