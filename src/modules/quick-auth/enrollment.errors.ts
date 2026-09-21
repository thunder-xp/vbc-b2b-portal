export class BusinessPhoneAuthError extends Error {
  constructor(readonly safeCode: string) {
    super("Business phone Auth operation failed.");
  }
}
