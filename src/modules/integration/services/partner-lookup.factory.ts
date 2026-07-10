import type { OneCEnv } from "../../../lib/env";
import { OneCProvider } from "../providers/one-c";
import { DefaultPartnerLookupService } from "./partner-lookup.service";

export function createPartnerLookupService(oneCEnv: OneCEnv) {
  const provider = new OneCProvider({
    baseUrl: oneCEnv.baseUrl,
    apiToken: oneCEnv.apiToken,
    username: oneCEnv.username,
    password: oneCEnv.password,
    partnerSearchPath: oneCEnv.partnerSearchPath,
    useMockPartners: oneCEnv.useMockPartners,
  });

  return new DefaultPartnerLookupService(provider.partners);
}
