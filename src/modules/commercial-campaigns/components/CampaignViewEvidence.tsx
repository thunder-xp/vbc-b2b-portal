"use client";

import { useEffect, useRef } from "react";
import { getBehaviorSessionId } from "../../behavior-analytics/client/behavior-session";
import { recordCampaignEngagementAction } from "../actions/commercial-campaign.actions";

export function CampaignViewEvidence({ campaignId }: { campaignId: string }) {
  const recorded = useRef<string | null>(null);
  useEffect(() => {
    if (recorded.current === campaignId) return;
    recorded.current = campaignId;
    try {
      void recordCampaignEngagementAction({ campaignId, eventType: "detail_opened",
        requestId: crypto.randomUUID(), sessionId: getBehaviorSessionId() }).catch(() => undefined);
    } catch { /* Storage or measurement failures cannot block the offer. */ }
  }, [campaignId]);
  return null;
}
