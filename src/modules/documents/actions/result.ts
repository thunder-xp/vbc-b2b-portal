export type DocumentActionResult<T> = { success: true; data: T; message: string } | { success: false; data: null; message: string; correlationId: string };
export const documentSuccess = <T>(data: T, message: string): DocumentActionResult<T> => ({ success: true, data, message });
export const documentFailure = <T>(message: string, correlationId = crypto.randomUUID()): DocumentActionResult<T> => ({ success: false, data: null, message, correlationId });

