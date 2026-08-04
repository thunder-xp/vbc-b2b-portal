import type { OrderMapper } from "../../mapping";
import type {
  OneCSalesOrderExportResultPayload,
  OneCSalesOrderPayload,
} from "./one-c-provider.types";

export type OneCOrderMapper = OrderMapper<OneCSalesOrderPayload, OneCSalesOrderExportResultPayload>;
