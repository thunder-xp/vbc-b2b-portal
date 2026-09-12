import {
  BoundedMemoryMoldcellRelayStore,
  createMoldcellRelayHandler,
} from "@/src/modules/notifications/relay/moldcell-relay.service";

export const runtime = "nodejs";
export const maxDuration = 30;

const store = new BoundedMemoryMoldcellRelayStore();
const handler = createMoldcellRelayHandler({ store });

export async function POST(request: Request): Promise<Response> {
  if (process.env.MOLDCELL_RELAY_SINGLE_INSTANCE !== "CONFIRMED") {
    return Response.json({ error: "RELAY_STORE_NOT_CONFIGURED" }, { status: 503 });
  }
  return handler(request);
}
