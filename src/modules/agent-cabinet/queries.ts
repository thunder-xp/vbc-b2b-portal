import "server-only";

import { cache } from "react";

import { createAgentCabinetService } from "./service";

export const getAgentCabinetContext = cache(() => createAgentCabinetService().context());
