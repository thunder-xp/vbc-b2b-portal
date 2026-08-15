export interface RetailCheckoutPilotRepository {
  validate(tokenHash: string): Promise<boolean>;
  issue(input: { tokenHash: string; expiresAt: string; reason: string }): Promise<{ id: string; expiresAt: string }>;
  revoke(input: { tokenHash: string; reason: string }): Promise<boolean>;
}
