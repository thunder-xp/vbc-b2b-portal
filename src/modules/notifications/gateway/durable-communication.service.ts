import "server-only";

import type { CommunicationChannel, CommunicationIntent } from "./communication-intent";
import { CommunicationGatewayService } from "./communication-gateway.service";
import type {
  DurableCommunicationRecord,
  DurableCommunicationRepository,
} from "./durable-communication.repository";

export class DurableCommunicationService {
  constructor(
    private readonly gateway: CommunicationGatewayService,
    private readonly repository: DurableCommunicationRepository,
  ) {}

  async persist(
    intent: CommunicationIntent,
    channels: readonly CommunicationChannel[],
  ): Promise<DurableCommunicationRecord> {
    const uniqueChannels = [...new Set(channels)];
    if (!uniqueChannels.length) throw new Error("At least one communication channel is required.");
    const projections = uniqueChannels.map((channel) => this.gateway.project(intent, channel));
    return this.repository.persist(intent, projections);
  }
}
