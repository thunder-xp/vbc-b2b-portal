export type ActionResult<T> =
  | { success: true; data: T; message: string; errorCode: null }
  | { success: false; data: null; message: string; errorCode: string };

export function success<T>(data: T, message: string): ActionResult<T> {
  return { success: true, data, message, errorCode: null };
}

export function failure<T = never>(
  errorCode: string,
  message: string,
): ActionResult<T> {
  return { success: false, data: null, message, errorCode };
}
