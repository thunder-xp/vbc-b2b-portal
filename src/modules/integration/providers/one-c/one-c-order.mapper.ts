import type { OrderMapper } from "../../mapping";
import type {
  OneCSalesOrderExportResultPayload,
  OneCSalesOrderPayload,
} from "./one-c-provider.types";

export interface OneCOrderMapper
  extends OrderMapper<OneCSalesOrderPayload, OneCSalesOrderExportResultPayload> {}
