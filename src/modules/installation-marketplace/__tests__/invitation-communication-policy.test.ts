import { describe, expect, it } from "vitest";
import { classifyCommunicationPurpose, DEFAULT_PURPOSE_CHANNEL_MODES } from "@/src/modules/notifications/gateway/communication-policy.service";

describe("Marketplace invitation communication policy",()=>{
  it("uses the existing transactional email lane while keeping SMS disabled",()=>{
    expect(classifyCommunicationPurpose("marketplace.invitation")).toBe("TRANSACTIONAL");
    expect(DEFAULT_PURPOSE_CHANNEL_MODES.TRANSACTIONAL.email).toBe("LIVE");
    expect(DEFAULT_PURPOSE_CHANNEL_MODES.TRANSACTIONAL.sms).toBe("DISABLED");
  });
});
