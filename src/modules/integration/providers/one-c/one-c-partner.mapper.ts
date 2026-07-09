import type { PartnerCompanyDTO } from "../../dto";
import type { ERPMapper } from "../../mapping";
import type { OneCPartnerCompanyPayload } from "./one-c-provider.types";

export interface OneCPartnerMapper
  extends ERPMapper<OneCPartnerCompanyPayload, PartnerCompanyDTO> {}
