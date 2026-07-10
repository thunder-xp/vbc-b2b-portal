export function isDevTestModeEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV === "development" && env.DEV_TEST_MODE === "true";
}

export function isDevTestInternalManagerEmail(
  email: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isDevTestModeEnabled(env)) {
    return false;
  }

  const configuredEmail = env.DEV_TEST_MANAGER_EMAIL?.trim().toLowerCase();
  const userEmail = email?.trim().toLowerCase();

  return Boolean(configuredEmail && userEmail === configuredEmail);
}
