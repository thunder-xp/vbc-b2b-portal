import "server-only";

import {
  isSmtpEmailConfigured,
  SmtpEmailProvider,
  SmtpEmailProviderError,
  type SmtpEmailErrorCategory,
} from "@/src/lib/email/smtp-email-provider";

export type ProposalEmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  messageId?: string;
  attachment?: { filename: string; content: Uint8Array };
};

export interface ProposalEmailProvider {
  send(message: ProposalEmailMessage): Promise<{ messageId: string | null; category: "accepted" }>;
}

export type ProposalEmailVerificationResult = {
  configured: boolean;
  connectionSuccessful: boolean;
  authenticationSuccessful: boolean;
  errorCategory: ProposalEmailProviderError["category"] | null;
  durationMs: number;
};

export class ProposalEmailProviderError extends Error {
  constructor(readonly category: "configuration" | "timeout" | "authentication" | "rejected" | "unavailable") {
    super("Proposal email provider failed.");
    this.name = "ProposalEmailProviderError";
  }
}

export class SmtpProposalEmailProvider implements ProposalEmailProvider {
  async verify(): Promise<ProposalEmailVerificationResult> {
    return new SmtpEmailProvider().verify();
  }

  async send(message: ProposalEmailMessage) {
    try {
      return await new SmtpEmailProvider().send({
        ...message,
        attachment: message.attachment ? { ...message.attachment, contentType: "application/pdf" } : undefined,
      });
    } catch (error) {
      throw new ProposalEmailProviderError(smtpCategory(error));
    }
  }
}

export function verifySmtpTransport(): Promise<ProposalEmailVerificationResult> {
  return new SmtpProposalEmailProvider().verify();
}

export function isProposalEmailConfigured(): boolean {
  return isSmtpEmailConfigured();
}

function smtpCategory(error: unknown): SmtpEmailErrorCategory {
  if (error instanceof ProposalEmailProviderError) return error.category;
  if (error instanceof SmtpEmailProviderError) return error.category;
  return "unavailable";
}
