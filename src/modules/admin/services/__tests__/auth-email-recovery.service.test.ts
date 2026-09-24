import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AuthEmailRecoveryIdentity,
  AuthEmailRecoveryRepository,
} from "../../repositories";
import { AuthEmailRecoveryService } from "../auth-email-recovery.service";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const ATTEMPT_ID = "33333333-3333-4333-8333-333333333333";
const CORRELATION_ID = "44444444-4444-4444-8444-444444444444";

const identity: AuthEmailRecoveryIdentity = {
  id: USER_ID,
  email: "admin@psg.md",
  emailConfirmedAt: null,
  createdAt: "2026-09-24T14:10:58Z",
  locale: "ru",
  registrationIntent: "installer",
};

function createRepository() {
  return {
    findExactAuthUsers: vi.fn().mockResolvedValue([identity]),
    getAuthUserById: vi.fn().mockResolvedValue(identity),
    getProfileState: vi.fn().mockResolvedValue({ exists: false, status: null }),
    getLatestAttempt: vi.fn().mockResolvedValue(null),
    reserveAttempt: vi.fn().mockResolvedValue({ attemptId: ATTEMPT_ID, outcome: "RESERVED", status: "RESERVED" }),
    generateSignupLink: vi.fn().mockResolvedValue({
      actionLink: "https://project.supabase.co/auth/v1/verify?token=hashed&type=signup&redirect_to=https%3A%2F%2Fwww.nsd.md%2Fauth%2Fsign-in",
      emailOtp: "123456",
      userId: USER_ID,
    }),
    recordOutcome: vi.fn().mockResolvedValue(undefined),
  } satisfies AuthEmailRecoveryRepository;
}

function executeInput() {
  return {
    actorUserId: ACTOR_ID,
    authUserId: USER_ID,
    correlationId: CORRELATION_ID,
    originalErrorConfirmed: true,
    mailboxValidityConfirmed: true,
    explicitlyAuthorized: true,
  };
}

describe("AuthEmailRecoveryService", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  });

  it("generates and sends one signup link for the same existing unconfirmed identity", async () => {
    const repository = createRepository();
    const send = vi.fn().mockResolvedValue({ category: "accepted", messageId: "safe" });
    const service = new AuthEmailRecoveryService(repository, { send });

    await expect(service.execute(executeInput())).resolves.toEqual({
      authUserId: USER_ID,
      correlationId: CORRELATION_ID,
      deliveryResult: "ACCEPTED",
      idempotent: false,
    });

    expect(repository.generateSignupLink).toHaveBeenCalledOnce();
    expect(repository.findExactAuthUsers).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: "admin@psg.md",
      text: expect.stringContaining("/auth/v1/verify?token=hashed"),
    }));
    expect(repository.recordOutcome).toHaveBeenNthCalledWith(1, expect.objectContaining({ outcome: "LINK_GENERATED" }));
    expect(repository.recordOutcome).toHaveBeenNthCalledWith(2, expect.objectContaining({ outcome: "DELIVERY_ACCEPTED" }));
  });

  it("rejects an already confirmed user without generating or sending", async () => {
    const repository = createRepository();
    repository.getAuthUserById.mockResolvedValue({ ...identity, emailConfirmedAt: "2026-09-24T16:00:00Z" });
    const send = vi.fn();
    const service = new AuthEmailRecoveryService(repository, { send });
    await expect(service.execute(executeInput())).rejects.toMatchObject({ code: "ALREADY_CONFIRMED" });
    expect(repository.generateSignupLink).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("governs unknown and ambiguous identities without creating a user", async () => {
    const unknown = createRepository();
    unknown.getAuthUserById.mockResolvedValue(null);
    await expect(new AuthEmailRecoveryService(unknown, { send: vi.fn() }).execute(executeInput()))
      .rejects.toMatchObject({ code: "IDENTITY_UNKNOWN" });
    expect(unknown.generateSignupLink).not.toHaveBeenCalled();

    const ambiguous = createRepository();
    ambiguous.findExactAuthUsers.mockResolvedValue([identity, { ...identity, id: ACTOR_ID }]);
    await expect(new AuthEmailRecoveryService(ambiguous, { send: vi.fn() }).execute(executeInput()))
      .rejects.toMatchObject({ code: "IDENTITY_AMBIGUOUS" });
    expect(ambiguous.generateSignupLink).not.toHaveBeenCalled();
  });

  it("requires explicit evidence confirmations", async () => {
    const repository = createRepository();
    const service = new AuthEmailRecoveryService(repository, { send: vi.fn() });
    await expect(service.execute({ ...executeInput(), mailboxValidityConfirmed: false }))
      .rejects.toMatchObject({ code: "EVIDENCE_REQUIRED" });
    expect(repository.getAuthUserById).not.toHaveBeenCalled();
  });

  it("enforces the durable rate limit before link generation", async () => {
    const repository = createRepository();
    repository.reserveAttempt.mockResolvedValue({ attemptId: null, outcome: "RATE_LIMITED", status: null });
    const send = vi.fn();
    await expect(new AuthEmailRecoveryService(repository, { send }).execute(executeInput()))
      .rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(repository.generateSignupLink).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("is idempotent after an accepted delivery and does not resend", async () => {
    const repository = createRepository();
    repository.reserveAttempt.mockResolvedValue({ attemptId: ATTEMPT_ID, outcome: "ALREADY_DELIVERED", status: "DELIVERY_ACCEPTED" });
    const send = vi.fn();
    await expect(new AuthEmailRecoveryService(repository, { send }).execute(executeInput()))
      .resolves.toMatchObject({ idempotent: true, deliveryResult: "ACCEPTED" });
    expect(repository.generateSignupLink).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("records a redacted provider failure and never retries", async () => {
    const repository = createRepository();
    const send = vi.fn().mockRejectedValue(new Error("provider detail must not escape"));
    await expect(new AuthEmailRecoveryService(repository, { send }).execute(executeInput()))
      .rejects.toMatchObject({ code: "DELIVERY_FAILED" });
    expect(send).toHaveBeenCalledOnce();
    expect(repository.recordOutcome).toHaveBeenLastCalledWith({
      attemptId: ATTEMPT_ID,
      correlationId: CORRELATION_ID,
      outcome: "DELIVERY_FAILED",
      deliveryResult: "PROVIDER_UNAVAILABLE",
    });
  });

  it("fails closed when the generated link resolves to another identity", async () => {
    const repository = createRepository();
    repository.generateSignupLink.mockResolvedValue({
      actionLink: "https://project.supabase.co/auth/v1/verify?token=hashed&type=signup",
      emailOtp: "123456",
      userId: ACTOR_ID,
    });
    const send = vi.fn();
    await expect(new AuthEmailRecoveryService(repository, { send }).execute(executeInput()))
      .rejects.toMatchObject({ code: "IDENTITY_AMBIGUOUS" });
    expect(send).not.toHaveBeenCalled();
  });

  it("observes successful Supabase verification without exposing token material", async () => {
    const repository = createRepository();
    repository.findExactAuthUsers.mockResolvedValue([{ ...identity, emailConfirmedAt: "2026-09-24T17:00:00Z" }]);
    repository.getLatestAttempt.mockResolvedValue({
      id: ATTEMPT_ID,
      authUserId: USER_ID,
      correlationId: CORRELATION_ID,
      status: "DELIVERY_ACCEPTED",
      deliveryResult: "ACCEPTED",
      verificationResult: "PENDING",
      generatedAt: "2026-09-24T16:55:00Z",
      createdAt: "2026-09-24T16:54:00Z",
    });
    const diagnosis = await new AuthEmailRecoveryService(repository, { send: vi.fn() }).diagnose("admin@psg.md");
    expect(diagnosis).toMatchObject({ identityState: "CONFIRMED", verificationResult: "ACCEPTED", eligible: false });
    expect(repository.recordOutcome).toHaveBeenCalledWith({
      attemptId: ATTEMPT_ID,
      correlationId: CORRELATION_ID,
      outcome: "VERIFICATION_ACCEPTED",
    });
    expect(JSON.stringify(diagnosis)).not.toMatch(/token|action_link|hashed/i);
  });
});
