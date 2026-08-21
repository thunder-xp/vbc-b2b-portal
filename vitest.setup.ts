import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => undefined) })),
  headers: vi.fn(async () => new Headers()),
}));

afterEach(() => {
  cleanup();
});
