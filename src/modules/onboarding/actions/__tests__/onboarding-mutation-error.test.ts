import { describe, expect, it } from "vitest";

import { RepositoryUnexpectedError } from "@/src/modules/access-control/repositories";

import {
  classifyOnboardingMutationError,
  diagnoseOnboardingMutationError,
  type OnboardingMutationContext,
} from "../onboarding-mutation-error";

const context: OnboardingMutationContext = {
  correlationId: "dc46c631-d894-42d3-821f-0edc5f73bb30",
  accessRequestId: "689b8aa3-4b47-4eda-b91e-b77f182667d0",
  approvalDraftId: "689b8aa3-4b47-4eda-b91e-b77f182667d0",
  currentWizardStep: 2,
  attemptedNextStep: 3,
  mutationActionName: "saveOnboardingCommercialStepAction",
  rpcFunctionName: "save_onboarding_approval_draft",
  draftVersion: 3,
  expectedVersion: 3,
  selectedManagerId: "0840b87b-16b3-41ed-88f9-344f221ba850",
  selectedPartnerStatus: "6e20ee32-7c80-432a-9ecb-a6d772a852fb",
  selectedPriceTypeReference: "6e20ee32-7c80-432a-9ecb-a6d772a852fb",
  paymentModel: "inherited_from_1c",
  ordersEnabled: true,
  financeEnabled: false,
};

describe("onboarding mutation diagnostics", () => {
  it("retains SQLSTATE and safe RPC diagnostics from a repository error", () => {
    const error = new RepositoryUnexpectedError({
      operation: "save_onboarding_approval_draft",
      cause: {
        code: "42702",
        message: "column reference counterparty.external_1c_id is ambiguous",
        details: "It could refer to either a PL/pgSQL variable or a table column.",
        hint: "Rename the table alias.",
      },
    });

    expect(diagnoseOnboardingMutationError(error, context, 14.6)).toMatchObject({
      reason: "ONBOARDING_COMMERCIAL_PERSISTENCE_FAILED",
      errorClass: "RepositoryUnexpectedError",
      errorName: "RepositoryUnexpectedError",
      sqlState: "42702",
      databaseDetails: "It could refer to either a PL/pgSQL variable or a table column.",
      elapsedMs: 15,
    });
  });

  it.each([
    ["stale_approval_draft", "PT409", "ONBOARDING_DRAFT_VERSION_CONFLICT"],
    ["onboarding_manager_invalid", "22023", "ONBOARDING_MANAGER_INVALID"],
    ["invalid_price_profile", "22023", "ONBOARDING_PARTNER_STATUS_INVALID"],
    ["onboarding_price_type_required", "22023", "ONBOARDING_PRICE_TYPE_REQUIRED"],
    ["onboarding_commercial_validation_failed", "22023", "ONBOARDING_COMMERCIAL_VALIDATION_FAILED"],
    ["invalid_status_transition", "55000", "ONBOARDING_STATE_TRANSITION_FAILED"],
    ["connection failure", "08006", "ONBOARDING_INFRASTRUCTURE_FAILURE"],
  ])("classifies %s", (message, sqlState, expected) => {
    expect(classifyOnboardingMutationError(message, sqlState)).toBe(expected);
  });

  it("does not disguise a genuine serialization failure as a domain conflict", () => {
    expect(classifyOnboardingMutationError("could not serialize access", "40001")).toBe("unknown_retryable");
  });

  it("does not retain unsafe failing-row details", () => {
    const error = new RepositoryUnexpectedError({
      cause: { code: "23514", message: "check violation", details: "Failing row contains (private data)" },
    });
    expect(diagnoseOnboardingMutationError(error, context, 1).databaseDetails).toBeNull();
  });
});
