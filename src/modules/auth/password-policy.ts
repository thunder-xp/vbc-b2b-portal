export const PASSWORD_MIN_LENGTH = 8;

export type PasswordPolicyIssue = "required" | "too_short" | null;

export function passwordPolicyIssue(password: string): PasswordPolicyIssue {
  if (!password) return "required";
  if (password.length < PASSWORD_MIN_LENGTH) return "too_short";
  return null;
}
