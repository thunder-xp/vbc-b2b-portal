"use client";

import { LoadingState } from "@/src/modules/platform-ui";
import { getEstimatesCopy, usePartnerLocale } from "@/src/modules/partner-locale";

export default function EstimatesLoading() {
  return <LoadingState label={getEstimatesCopy(usePartnerLocale()).loading} rows={4} />;
}
