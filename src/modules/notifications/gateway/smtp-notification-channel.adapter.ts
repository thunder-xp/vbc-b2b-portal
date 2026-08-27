import "server-only";

import {
  ProposalEmailProviderError,
  SmtpProposalEmailProvider,
  type ProposalEmailProvider,
} from "../../estimates/services/proposal-email.provider";
import {
  NotificationDeliveryError,
  type NotificationChannelAdapter,
  type NotificationMessage,
} from "./types";

export class SmtpNotificationChannelAdapter
implements NotificationChannelAdapter {
  readonly channel = "email" as const;

  constructor(
    private readonly provider: ProposalEmailProvider = new SmtpProposalEmailProvider(),
  ) {}

  async send(message: NotificationMessage) {
    try {
      const result = await this.provider.send({
        to: message.recipient,
        subject: message.subject,
        text: message.text,
        html: message.html,
        messageId: message.messageId,
      });
      return { providerMessageId: result.messageId };
    } catch (error) {
      const category = error instanceof ProposalEmailProviderError
        ? error.category
        : "unavailable";
      throw new NotificationDeliveryError(
        category,
        category === "timeout" || category === "unavailable",
      );
    }
  }
}
