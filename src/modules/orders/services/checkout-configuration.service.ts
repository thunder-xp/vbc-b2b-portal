import { NOVOTECH_ONE_C_ORGANIZATION_REF } from "../../integration/config";
import type {
  CheckoutConfiguration,
  CheckoutContractConfiguration,
  CheckoutFulfillmentMethod,
  CheckoutPaymentMethod,
} from "../repositories";
import { RecoverableOrderSubmissionError } from "./order-submission.errors";

export type PartnerCheckoutOptionsDto = {
  counterpartyKind: "legal_entity" | "physical_person" | "sole_proprietor" | "government_body" | "unknown";
  paymentMethods: Array<{
    value: CheckoutPaymentMethod;
    enabled: boolean;
    contractLabel: string | null;
    unavailableReason: "contract_unavailable" | null;
  }>;
  carriers: Array<{ id: string; name: string }>;
};

export type CheckoutSelection = {
  paymentMethod: CheckoutPaymentMethod;
  paymentDate: string;
  fulfillmentMethod: CheckoutFulfillmentMethod;
  carrierId: string | null;
};

export type ResolvedCheckoutSelection = CheckoutSelection & {
  contract: CheckoutContractConfiguration;
  carrierExternalRef: string | null;
};

export function toPartnerCheckoutOptions(config: CheckoutConfiguration): PartnerCheckoutOptionsDto {
  const kind = counterpartyKind(config.counterpartyTypeCode, config.governmentBodyTypeCode);
  const cashlessAllowed = validContract(config.cashless, config, true);
  const cashAllowed = validContract(config.cash, config, false);
  return {
    counterpartyKind: kind,
    paymentMethods: [
      {
        value: "cashless",
        enabled: cashlessAllowed,
        contractLabel: cashlessAllowed ? contractLabel(config.cashless!) : null,
        unavailableReason: cashlessAllowed ? null : "contract_unavailable",
      },
      {
        value: "cash",
        enabled: cashAllowed,
        contractLabel: cashAllowed ? contractLabel(config.cash!) : null,
        unavailableReason: cashAllowed ? null : "contract_unavailable",
      },
    ],
    carriers: config.carriers.map(({ id, name }) => ({ id, name })),
  };
}

export function resolveCheckoutSelection(
  config: CheckoutConfiguration,
  selection: CheckoutSelection,
): ResolvedCheckoutSelection {
  if (!config.counterpartyActive) throw mappingError();
  const contract = selection.paymentMethod === "cashless" ? config.cashless : config.cash;
  if (!validContract(contract, config, selection.paymentMethod === "cashless")) {
    throw new RecoverableOrderSubmissionError(
      "The selected payment contract is unavailable.",
      "ORDER_PAYMENT_METHOD_UNAVAILABLE",
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selection.paymentDate)) {
    throw new RecoverableOrderSubmissionError("Payment date is invalid.", "ORDER_INVALID_PAYMENT_DATE");
  }
  if (selection.fulfillmentMethod === "pickup") {
    if (selection.carrierId !== null) {
      throw new RecoverableOrderSubmissionError("Pickup cannot use a carrier.", "ORDER_FULFILLMENT_INVALID");
    }
    return { ...selection, contract, carrierExternalRef: null };
  }
  const carrier = config.carriers.find((item) => item.id === selection.carrierId);
  if (!carrier) {
    throw new RecoverableOrderSubmissionError("Delivery carrier is required.", "ORDER_CARRIER_REQUIRED");
  }
  return { ...selection, contract, carrierExternalRef: carrier.externalRef };
}

function validContract(
  contract: CheckoutContractConfiguration | null,
  config: CheckoutConfiguration,
  requireCompanyPriceType: boolean,
): contract is CheckoutContractConfiguration {
  return Boolean(
    contract?.active
    && normalizeContractType(contract.contractType) === "спокупателем"
    && contract.organizationRef?.toLowerCase() === NOVOTECH_ONE_C_ORGANIZATION_REF
    && contract.priceTypeRef
    && contract.currencyRef
    && contract.currencyCode
    && contract.contractCurrencyRef
    && (requireCompanyPriceType
      || contract.contractCurrencyRef.toLowerCase() === contract.currencyRef.toLowerCase())
    && (!requireCompanyPriceType || contract.priceTypeRef.toLowerCase() === config.priceTypeRef.toLowerCase()),
  );
}

function normalizeContractType(value: string | null): string {
  return value?.toLocaleLowerCase("ru-RU").replace(/[^а-яa-z]/g, "") ?? "";
}

function contractLabel(contract: CheckoutContractConfiguration): string {
  return contract.number?.trim() || contract.name;
}

function counterpartyKind(
  typeCode: string | null,
  governmentCode: string | null,
): PartnerCheckoutOptionsDto["counterpartyKind"] {
  if (governmentCode) return "government_body";
  if (typeCode === "ЮридическоеЛицо") return "legal_entity";
  if (typeCode === "ФизическоеЛицо") return "physical_person";
  if (typeCode === "ИндивидуальныйПредприниматель") return "sole_proprietor";
  return "unknown";
}

function mappingError(): RecoverableOrderSubmissionError {
  return new RecoverableOrderSubmissionError(
    "The partner counterparty mapping is unavailable.",
    "ORDER_COMPANY_MAPPING_MISSING",
  );
}
