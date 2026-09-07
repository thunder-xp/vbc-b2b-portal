import type { CommunicationIntent, CommunicationProjection } from "./communication-intent";

export type DurableCommunicationRecord = Readonly<{
  intentId: string;
  eventId: string;
  deliveries: readonly Readonly<{
    deliveryId: string;
    deliveryIdentity: string;
    channel: CommunicationProjection["channel"];
    channelMode: CommunicationProjection["mode"];
    state: "PROJECTED" | "SUPPRESSED" | "READY" | "QUEUED";
  }>[];
}>;

export interface DurableCommunicationRepository {
  persist(
    intent: CommunicationIntent,
    projections: readonly CommunicationProjection[],
  ): Promise<DurableCommunicationRecord>;
}
