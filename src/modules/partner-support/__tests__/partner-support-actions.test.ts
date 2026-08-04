import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/modules/partner-support/actions.ts", "utf8");

describe("partner support actions", () => {
  it("does not swallow the Next.js redirect signal after ticket creation", () => {
    const action = source.slice(
      source.indexOf("export async function createSupportTicketAction"),
      source.indexOf("export async function addSupportReplyAction"),
    );

    expect(action).toContain("destination = `/cabinet/support/${created.id}?created=1");
    expect(action.indexOf("redirect(destination)")).toBeGreaterThan(action.lastIndexOf("catch (error)"));
  });
});
