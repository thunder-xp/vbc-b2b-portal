"use client";

import { type FormEvent, useState, useTransition } from "react";

import {
  approveAccessRequestAction,
  rejectAccessRequestAction,
} from "../../actions/admin/access-approval.actions";
import {
  getOneCPartnerContractsAction,
  listOneCPriceTypesAction,
  searchOneCPartnersAction,
  type PartnerContractActionDto,
  type PartnerPriceTypeActionDto,
  type PartnerSearchResultActionDto,
} from "@/src/modules/integration/actions";

type AccessRequestDecisionFormsProps = {
  requestId: string;
};

export function AccessRequestDecisionForms({
  requestId,
}: AccessRequestDecisionFormsProps) {
  const [external1cId, setExternal1cId] = useState("");
  const [external1cCode, setExternal1cCode] = useState("");
  const [external1cContractId, setExternal1cContractId] = useState("");
  const [external1cPriceTypeId, setExternal1cPriceTypeId] = useState("");
  const [selectedPartner, setSelectedPartner] =
    useState<PartnerSearchResultActionDto | null>(null);
  const [selectedContractName, setSelectedContractName] = useState("");
  const [selectedPriceTypeName, setSelectedPriceTypeName] = useState("");
  const [contracts, setContracts] = useState<PartnerContractActionDto[]>([]);
  const [priceTypes, setPriceTypes] = useState<PartnerPriceTypeActionDto[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    PartnerSearchResultActionDto[]
  >([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [decisionReason, setDecisionReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setError(null);

    startTransition(async () => {
      const result = await approveAccessRequestAction({
        requestId,
        external1cId,
        external1cCode,
        external1cContractId,
        external1cPriceTypeId,
        decisionReason,
      });

      if (result.success) {
        setNotice(result.message);
        return;
      }

      setError(result.message);
    });
  }

  function searchPartners() {
    setSearchError(null);

    startTransition(async () => {
      const result = await searchOneCPartnersAction({ query: searchQuery });

      if (result.success) {
        setSearchResults(result.data);
        setSearchError(result.data.length === 0 ? "No matching counterparty found." : null);
        return;
      }

      setSearchResults([]);
      setSearchError(result.message);
    });
  }

  function selectPartner(partner: PartnerSearchResultActionDto) {
    setSelectedPartner(partner);
    setExternal1cId(partner.external1cId);
    setExternal1cCode(partner.code);
    setExternal1cContractId("");
    setExternal1cPriceTypeId("");
    setSelectedContractName("");
    setSelectedPriceTypeName("");
    setContracts([]);
    setPriceTypes([]);
    setSearchError(null);
    startTransition(async () => {
      const result = await getOneCPartnerContractsAction({ partnerReference: partner.external1cId });
      if (!result.success) {
        setSearchError(result.message);
        return;
      }
      setContracts(result.data);
      if (result.data.length === 0) {
        setSearchError("No active contracts found.");
        return;
      }
      if (result.data.length === 1) selectContract(result.data[0]);
    });
  }

  function selectContract(contract: PartnerContractActionDto) {
    setExternal1cContractId(contract.external1cContractId);
    setSelectedContractName(contract.name);
    setSearchError(null);
    if (contract.priceType) {
      selectPriceType(contract.priceType);
      setIsSearchOpen(false);
      return;
    }
    setExternal1cPriceTypeId("");
    setSelectedPriceTypeName("");
    startTransition(async () => {
      const result = await listOneCPriceTypesAction();
      if (result.success) {
        setPriceTypes(result.data);
        setSearchError(result.data.length === 0 ? "Price type is not configured for this contract." : null);
      } else {
        setSearchError(result.message);
      }
    });
  }

  function selectPriceType(priceType: PartnerPriceTypeActionDto) {
    setExternal1cPriceTypeId(priceType.external1cPriceTypeId);
    setSelectedPriceTypeName(priceType.name);
  }

  function reject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setError(null);

    startTransition(async () => {
      const result = await rejectAccessRequestAction({
        requestId,
        reason: rejectReason,
      });

      if (result.success) {
        setNotice(result.message);
        return;
      }

      setError(result.message);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
        onSubmit={approve}
      >
        <h2 className="text-lg font-semibold text-zinc-950">Approve access</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Search 1C and select the existing partner. The binding references are
          populated automatically and are never partner-editable.
        </p>
        <div className="mt-5 grid gap-4">
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  Selected 1C partner
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  {selectedPartner
                    ? selectedPartner.displayName
                    : "No 1C partner selected."}
                </p>
              </div>
              <button
                className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
                onClick={() => setIsSearchOpen(true)}
                type="button"
              >
                Search in 1C
              </button>
            </div>

            {selectedPartner && (
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <BindingValue
                  label="1C partner reference"
                  value={external1cId}
                />
                <BindingValue
                  label="1C contract reference"
                  value={external1cContractId}
                />
                <BindingValue
                  label="Price type / price group reference"
                  value={external1cPriceTypeId}
                />
                <BindingValue label="Contract" value={selectedContractName} />
                <BindingValue
                  label="Price type"
                  value={selectedPriceTypeName}
                />
              </dl>
            )}
          </div>
          <label className="grid gap-2 text-sm font-medium text-zinc-800">
            Approval note
            <textarea
              className="min-h-24 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-950"
              onChange={(event) => setDecisionReason(event.target.value)}
              value={decisionReason}
            />
          </label>
        </div>
        <button
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          disabled={
            isPending ||
            !external1cId ||
            !external1cContractId ||
            !external1cPriceTypeId
          }
          type="submit"
        >
          Approve
        </button>
      </form>

      {isSearchOpen && (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/40 p-4"
          role="dialog"
        >
          <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-950">
                  Search in 1C
                </h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Search by company name, fiscal code, or 1C reference.
                </p>
              </div>
              <button
                className="text-sm font-medium text-zinc-600 hover:text-zinc-950"
                onClick={() => setIsSearchOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="mt-5 flex gap-2">
              <input
                className="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Company name, VAT/IDNO, or 1C reference"
                value={searchQuery}
              />
              <button
                className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
                disabled={isPending}
                onClick={searchPartners}
                type="button"
              >
                Search
              </button>
            </div>

            {searchError && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                {searchError}
              </p>
            )}

            <div className="mt-5 grid max-h-96 gap-3 overflow-auto">
              {searchResults.map((partner) => (
                <div
                  className="rounded-md border border-zinc-200 p-4"
                  key={partner.external1cId}
                >
                  <p className="font-medium text-zinc-950">
                    {partner.displayName}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {partner.fullName ?? "No full legal name"}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    Fiscal code: {partner.taxId ?? "Not available"} · Code: {partner.code}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {partner.buyer ? "Buyer" : "Not marked as buyer"} · {partner.supplier ? "Supplier" : "Not marked as supplier"}
                  </p>
                  <button
                    className="mt-3 rounded-md border border-emerald-600 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
                    onClick={() => selectPartner(partner)}
                    type="button"
                  >
                    Select counterparty
                  </button>
                </div>
              ))}

              {selectedPartner && contracts.length > 0 && (
                <div className="rounded-md border border-zinc-200 p-4">
                  <p className="font-medium text-zinc-950">Active contracts</p>
                  <div className="mt-3 grid gap-2">
                    {contracts.map((contract) => (
                      <button
                        className="rounded-md border border-zinc-200 px-3 py-2 text-left text-sm hover:border-emerald-600 hover:bg-emerald-50"
                        key={contract.external1cContractId}
                        onClick={() => selectContract(contract)}
                        type="button"
                      >
                        <span className="font-medium text-zinc-900">{contract.name}</span>
                        <span className="mt-1 block text-zinc-600">
                          {contract.number ?? contract.code} · {contract.date ?? "No date"} · {contract.contractType ?? "No contract type"}
                        </span>
                        <span className="mt-1 block text-zinc-600">
                          Price type: {contract.priceType?.name ?? "Requires selection"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {external1cContractId && !external1cPriceTypeId && priceTypes.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
                  <p className="font-medium text-zinc-950">Select active price type</p>
                  <div className="mt-3 grid gap-2">
                    {priceTypes.map((priceType) => (
                      <button
                        className="rounded-md border border-amber-300 bg-white px-3 py-2 text-left text-sm hover:border-emerald-600"
                        key={priceType.external1cPriceTypeId}
                        onClick={() => {
                          selectPriceType(priceType);
                          setIsSearchOpen(false);
                        }}
                        type="button"
                      >
                        {priceType.name} · {priceType.external1cPriceTypeId}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <form
        className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
        onSubmit={reject}
      >
        <h2 className="text-lg font-semibold text-zinc-950">Reject request</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Rejecting does not create a company or membership.
        </p>
        <label className="mt-5 grid gap-2 text-sm font-medium text-zinc-800">
          Rejection reason
          <textarea
            className="min-h-32 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-950"
            onChange={(event) => setRejectReason(event.target.value)}
            value={rejectReason}
          />
        </label>
        <button
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md border border-red-300 px-4 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-zinc-400"
          disabled={isPending}
          type="submit"
        >
          Reject
        </button>
      </form>

      {(notice || error) && (
        <div className="lg:col-span-2">
          {notice && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {notice}
            </p>
          )}
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function BindingValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="font-medium text-zinc-800">{label}</dt>
      <dd className="mt-1 break-all text-zinc-600">{value}</dd>
    </div>
  );
}
