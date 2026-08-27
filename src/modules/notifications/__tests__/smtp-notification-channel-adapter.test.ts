import { describe, expect, it, vi } from "vitest";

import {
  ProposalEmailProviderError,
  type ProposalEmailProvider,
} from "../../estimates/services/proposal-email.provider";
import {
  NotificationDeliveryError,
  SmtpNotificationChannelAdapter,
} from "../gateway";

const message = {
  recipient: "buyer@example.com",
  subject: "Order",
  text: "Order text",
  html: "<p>Order text</p>",
  messageId: "<notification-1@nsd.md>",
};

describe("SmtpNotificationChannelAdapter", () => {
  it("reuses the governed transactional SMTP transport", async () => {
    const provider: ProposalEmailProvider = {
      send: vi.fn().mockResolvedValue({ messageId: "provider-1", category: "accepted" }),
    };
    await expect(new SmtpNotificationChannelAdapter(provider).send(message)).resolves.toEqual({
      providerMessageId: "provider-1",
    });
    expect(provider.send).toHaveBeenCalledWith({
      to: message.recipient,
      subject: message.subject,
      text: message.text,
      html: message.html,
      messageId: message.messageId,
    });
  });

  it.each([
    ["timeout", true],
    ["unavailable", true],
    ["configuration", false],
    ["authentication", false],
    ["rejected", false],
  ] as const)("classifies %s safely", async (category, retryable) => {
    const provider: ProposalEmailProvider = {
      send: vi.fn().mockRejectedValue(new ProposalEmailProviderError(category)),
    };
    await expect(new SmtpNotificationChannelAdapter(provider).send(message)).rejects
      .toEqual(expect.objectContaining<Partial<NotificationDeliveryError>>({
        category,
        retryable,
      }));
  });
});
