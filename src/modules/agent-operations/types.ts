export type AgentCodeState = "MATCH" | "MISSING" | "MISMATCH" | "NOT_VERIFIED";

export type AgentAuthState = {
  linked: boolean;
  email: string | null;
  emailConfirmed: boolean;
  phoneConfirmed: boolean;
  quickAuthReady: boolean;
  lastSignInAt: string | null;
};

export type AgentOperationsListItem = {
  id: string;
  agentCode: string;
  displayName: string;
  email: string | null;
  status: string;
  complianceStatus: string;
  auth: AgentAuthState;
  counterpartyLinked: boolean;
  counterpartyCodeState: AgentCodeState;
  contractState: "VERIFIED" | "LEGACY" | "MISSING" | "MISMATCH";
  projectState: "VERIFIED" | "MISSING" | "MISMATCH" | "NOT_CONFIGURED";
  economicState: "NONE" | "PROJECTION" | "APPROVED" | "PAID";
  lastVerifiedAt: string | null;
};

export type CounterpartyCandidate = {
  reference: string;
  externalCode: string | null;
  name: string;
  fiscalCode: string | null;
  active: boolean;
  deleted: boolean;
};

export type AgentContractCandidate = {
  reference: string;
  counterpartyRef: string;
  number: string | null;
  name: string;
  contractType: string;
  contractDate: string | null;
  validUntil: string | null;
  signed: boolean | null;
  active: boolean;
  deleted: boolean;
  sourceAgentCode: string | null;
  codeState: AgentCodeState;
  observedAt: string;
};

export type AgentProjectCandidate = {
  reference: string;
  code: string | null;
  name: string;
  counterpartyRef: string;
  contractRef: string;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  deleted: boolean;
  sourceAgentCode: string | null;
  codeState: AgentCodeState;
  codeEvidence: "CUSTOM_PROPERTY" | "STRUCTURED_NAME" | "NONE";
  observedAt: string;
};

export type AgentOperationsDetail = {
  auth: AgentAuthState;
  counterparty: null | {
    reference: string;
    externalCode: string;
    fiscalCode: string | null;
    name: string;
    sourceAgentCode: string | null;
    codeState: AgentCodeState;
    linkedAt: string;
    verifiedAt: string | null;
    observedAt: string | null;
    lastError: string | null;
  };
  contracts: Array<{
    id: string;
    reference: string;
    counterpartyRef: string;
    number: string | null;
    name: string;
    contractType: string;
    signed: boolean | null;
    sourceAgentCode: string | null;
    codeState: AgentCodeState;
    isCurrent: boolean;
    linkedAt: string;
    verifiedAt: string | null;
  }>;
  projects: Array<{
    id: string;
    reference: string;
    code: string | null;
    name: string;
    counterpartyRef: string;
    contractRef: string;
    sourceAgentCode: string | null;
    codeState: AgentCodeState;
    codeEvidence: "CUSTOM_PROPERTY" | "STRUCTURED_NAME" | "NONE";
    isCurrent: boolean;
    linkedAt: string;
    verifiedAt: string | null;
  }>;
  events: Array<{ id: string; type: string; createdAt: string; metadata: Record<string, unknown> }>;
  counterparties: CounterpartyCandidate[];
};

export type OperationsFilters = {
  search?: string;
  status?: string;
  compliance?: string;
  auth?: string;
  oneC?: string;
  contract?: string;
  project?: string;
};
