import { describe, expect, it } from "vitest";

import {
  RepositoryOperationNotAvailableError,
  RepositoryProfileCreationError,
  type CreateUserProfileInput,
  type UpdateOwnSafeUserProfileFieldsInput,
  type UserProfileRepository,
} from "../../../repositories";
import { UserStatus, UserType, type UserProfile } from "../../../types";
import {
  ForbiddenError,
  InvalidStateError,
  NotFoundError,
  OperationNotAvailableError,
  ProfileCreationError,
} from "../../errors";
import { DefaultUserProfileService } from "../user-profile.service.impl";

class FakeUserProfileRepository implements UserProfileRepository {
  profile: UserProfile | null = null;
  createError: Error | null = null;
  lastCreateInput: CreateUserProfileInput | null = null;
  lastUpdateInput:
    | {
        userId: string;
        input: UpdateOwnSafeUserProfileFieldsInput;
      }
    | null = null;

  async findById(): Promise<UserProfile | null> {
    return this.profile;
  }

  async findByEmail(): Promise<UserProfile | null> {
    return this.profile;
  }

  async create(input: CreateUserProfileInput): Promise<UserProfile> {
    this.lastCreateInput = input;

    if (this.createError) {
      throw this.createError;
    }

    return makeProfile({
      id: input.id,
      email: input.email,
      fullName: input.fullName ?? null,
      phone: input.phone ?? null,
    });
  }

  async activatePartnerProfile(userId: string): Promise<UserProfile> {
    return makeProfile({
      id: userId,
      status: UserStatus.Active,
      userType: UserType.Partner,
    });
  }

  async updateOwnSafeFields(
    userId: string,
    input: UpdateOwnSafeUserProfileFieldsInput,
  ): Promise<UserProfile> {
    this.lastUpdateInput = {
      userId,
      input,
    };

    return makeProfile({
      id: userId,
      fullName: input.fullName ?? null,
      phone: input.phone ?? null,
    });
  }
}

describe("DefaultUserProfileService", () => {
  it("getCurrentProfile returns profile", async () => {
    const repository = new FakeUserProfileRepository();
    const profile = makeProfile();
    repository.profile = profile;

    const service = new DefaultUserProfileService(repository);

    await expect(service.getCurrentProfile(profile.id)).resolves.toEqual(profile);
  });

  it("getCurrentProfile returns null when repository has no profile", async () => {
    const repository = new FakeUserProfileRepository();
    const service = new DefaultUserProfileService(repository);

    await expect(service.getCurrentProfile("missing-user")).resolves.toBeNull();
  });

  it("updateOwnProfile only passes safe fields", async () => {
    const repository = new FakeUserProfileRepository();
    const service = new DefaultUserProfileService(repository);

    await service.updateOwnProfile("user-1", {
      fullName: "Partner User",
      phone: "068 718 675",
    });

    expect(repository.lastUpdateInput).toEqual({
      userId: "user-1",
      input: {
        fullName: "Partner User",
        phone: "+37368718675",
        preferredLocale: undefined,
      },
    });
  });

  it("rejects a profile phone that cannot be canonicalized", async () => {
    const service = new DefaultUserProfileService(new FakeUserProfileRepository());

    await expect(service.updateOwnProfile("user-1", { phone: "+37337368718675" }))
      .rejects.toBeInstanceOf(InvalidStateError);
  });

  it("persists the governed locale through the existing self-profile boundary", async () => {
    const repository = new FakeUserProfileRepository();
    const service = new DefaultUserProfileService(repository);

    await service.updateOwnProfile("user-1", { preferredLocale: "ro" });

    expect(repository.lastUpdateInput).toEqual({
      userId: "user-1",
      input: { fullName: undefined, phone: undefined, preferredLocale: "ro" },
    });
  });

  it("ensureActiveUser passes for active user", async () => {
    const repository = new FakeUserProfileRepository();
    const profile = makeProfile({ status: UserStatus.Active });
    repository.profile = profile;

    const service = new DefaultUserProfileService(repository);

    await expect(service.ensureActiveUser(profile.id)).resolves.toEqual(profile);
  });

  it("ensureActiveUser throws NotFoundError for missing profile", async () => {
    const service = new DefaultUserProfileService(new FakeUserProfileRepository());

    await expect(service.ensureActiveUser("missing-user")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it.each([
    UserStatus.Suspended,
    UserStatus.Revoked,
    UserStatus.Rejected,
  ])("ensureActiveUser throws ForbiddenError for %s user", async (status) => {
    const repository = new FakeUserProfileRepository();
    repository.profile = makeProfile({ status });

    const service = new DefaultUserProfileService(repository);

    await expect(service.ensureActiveUser("user-1")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it.each([UserStatus.Registered, UserStatus.PendingApproval])(
    "ensureActiveUser throws InvalidStateError for %s user",
    async (status) => {
      const repository = new FakeUserProfileRepository();
      repository.profile = makeProfile({ status });

      const service = new DefaultUserProfileService(repository);

      await expect(service.ensureActiveUser("user-1")).rejects.toBeInstanceOf(
        InvalidStateError,
      );
    },
  );

  it("createProfileAfterSignup maps unavailable repository operation to OperationNotAvailableError", async () => {
    const repository = new FakeUserProfileRepository();
    repository.createError = new RepositoryOperationNotAvailableError(
      "user_profiles.create",
    );

    const service = new DefaultUserProfileService(repository);

    await expect(
      service.createProfileAfterSignup({
        userId: "user-1",
        email: "partner@example.com",
        correlationId: "8d216433-29d4-4785-9506-50ad2d515b04",
      }),
    ).rejects.toBeInstanceOf(OperationNotAvailableError);
  });

  it("canonicalizes a Moldova phone for governed profile creation", async () => {
    const repository = new FakeUserProfileRepository();
    const service = new DefaultUserProfileService(repository);

    await service.createProfileAfterSignup({
      userId: "user-1",
      email: "partner@example.com",
      phone: "067 497 101",
      correlationId: "8d216433-29d4-4785-9506-50ad2d515b04",
    });

    expect(repository.lastCreateInput).toMatchObject({
      phone: "+37367497101",
      correlationId: "8d216433-29d4-4785-9506-50ad2d515b04",
    });
  });

  it("returns INVALID_PHONE before calling the repository", async () => {
    const repository = new FakeUserProfileRepository();
    const service = new DefaultUserProfileService(repository);

    await expect(service.createProfileAfterSignup({
      userId: "user-1",
      email: "partner@example.com",
      phone: "+373123",
      correlationId: "8d216433-29d4-4785-9506-50ad2d515b04",
    })).rejects.toMatchObject({
      name: "ProfileCreationError",
      code: "INVALID_PHONE",
    } satisfies Partial<ProfileCreationError>);
    expect(repository.lastCreateInput).toBeNull();
  });

  it("preserves governed phone conflict diagnostics", async () => {
    const repository = new FakeUserProfileRepository();
    repository.createError = new RepositoryProfileCreationError(
      "PHONE_ALREADY_IN_USE",
      "8d216433-29d4-4785-9506-50ad2d515b04",
    );
    const service = new DefaultUserProfileService(repository);

    await expect(service.createProfileAfterSignup({
      userId: "user-1",
      email: "partner@example.com",
      phone: "+37367497101",
      correlationId: "8d216433-29d4-4785-9506-50ad2d515b04",
    })).rejects.toMatchObject({
      name: "ProfileCreationError",
      code: "PHONE_ALREADY_IN_USE",
    } satisfies Partial<ProfileCreationError>);
  });
});

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "user-1",
    email: "partner@example.com",
    fullName: "Partner User",
    phone: "+359 1 234",
    status: UserStatus.Active,
    userType: UserType.Partner,
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}
