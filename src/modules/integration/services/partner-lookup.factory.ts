import type { OneCEnv } from "../../../lib/env";
import { OneCProvider } from "../providers/one-c";
import { DefaultPartnerLookupService } from "./partner-lookup.service";
import { IntegrationProviderUnavailableError } from "../errors";

export function createPartnerLookupService(oneCEnv: OneCEnv) {
  if (
    !oneCEnv.useMockPartners &&
    (oneCEnv.authMode !== "basic" ||
      !oneCEnv.baseUrl ||
      !oneCEnv.username ||
      !oneCEnv.password)
  ) {
    throw new IntegrationProviderUnavailableError(
      "1C OData configuration is incomplete.",
    );
  }

  const provider = new OneCProvider({
    baseUrl: oneCEnv.baseUrl,
    username: oneCEnv.username,
    password: oneCEnv.password,
    partnerSearchPageSize: oneCEnv.partnerSearchPageSize,
    partnerSearchMaxPages: oneCEnv.partnerSearchMaxPages,
    requestTimeoutMs: oneCEnv.requestTimeoutMs,
    useMockPartners: oneCEnv.useMockPartners,
  });

  return new DefaultPartnerLookupService(provider.partners);
}
