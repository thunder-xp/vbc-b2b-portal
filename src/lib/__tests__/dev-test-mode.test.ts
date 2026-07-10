import { describe, expect, it } from "vitest";

import {
  isDevTestInternalManagerEmail,
  isDevTestModeEnabled,
} from "../dev-test-mode";

describe("dev test mode", () => {
  it("is disabled in production", () => {
    const env = {
      NODE_ENV: "production",
      DEV_TEST_MODE: "true",
      DEV_TEST_MANAGER_EMAIL: "manager@example.com",
    } as NodeJS.ProcessEnv;

    expect(isDevTestModeEnabled(env)).toBe(false);
    expect(isDevTestInternalManagerEmail("manager@example.com", env)).toBe(false);
  });

  it("is disabled when DEV_TEST_MODE is false", () => {
    const env = {
      NODE_ENV: "development",
      DEV_TEST_MODE: "false",
      DEV_TEST_MANAGER_EMAIL: "manager@example.com",
    } as NodeJS.ProcessEnv;

    expect(isDevTestModeEnabled(env)).toBe(false);
    expect(isDevTestInternalManagerEmail("manager@example.com", env)).toBe(false);
  });

  it("allows configured manager email in development test mode", () => {
    const env = {
      NODE_ENV: "development",
      DEV_TEST_MODE: "true",
      DEV_TEST_MANAGER_EMAIL: "manager@example.com",
    } as NodeJS.ProcessEnv;

    expect(isDevTestModeEnabled(env)).toBe(true);
    expect(isDevTestInternalManagerEmail(" MANAGER@example.com ", env)).toBe(true);
  });

  it("does not allow other emails", () => {
    const env = {
      NODE_ENV: "development",
      DEV_TEST_MODE: "true",
      DEV_TEST_MANAGER_EMAIL: "manager@example.com",
    } as NodeJS.ProcessEnv;

    expect(isDevTestInternalManagerEmail("partner@example.com", env)).toBe(false);
  });
});
