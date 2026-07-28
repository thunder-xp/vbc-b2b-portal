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
  const [selectedPriceTypeSource, setSelectedPriceTypeSource] = useState("");
  const [contracts, setContracts] = useState<PartnerContractActionDto[]>([]);
  const [priceTypes, setPriceTypes] = useState<PartnerPriceTypeActionDto[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    PartnerSearchResultActionDto[]
  >([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [bindingNotice, setBindingNotice] = useState<string | null>(null);
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
        external1cCode: external1cCode || null,
        external1cContractId: external1cContractId || null,
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
        setSearchError(result.data.length === 0 ? "Контрагенты не найдены." : null);
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
    setSelectedPriceTypeSource("");
    setContracts([]);
    setPriceTypes([]);
    setSearchError(null);
    setBindingNotice(null);
    startTransition(async () => {
      const [contractsResult, priceTypesResult] = await Promise.all([
        getOneCPartnerContractsAction({ partnerReference: partner.external1cId }),
        listOneCPriceTypesAction(),
      ]);

      if (!contractsResult.success) {
        setSearchError(contractsResult.message);
        return;
      }

      if (!priceTypesResult.success) {
        setSearchError(priceTypesResult.message);
        return;
      }

      setContracts(contractsResult.data);
      setPriceTypes(priceTypesResult.data);
      if (contractsResult.data.length === 0) {
        setBindingNotice("Для выбранного контрагента активные договоры в 1С не найдены.\nВыберите статус партнёра вручную.");
      }
      if (priceTypesResult.data.length === 0) {
        setSearchError("В 1С не найдены доступные статусы партнёра.");
      }
      if (contractsResult.data.length === 1) selectContract(contractsResult.data[0]);
    });
  }

  function selectContract(contract: PartnerContractActionDto) {
    setExternal1cContractId(contract.external1cContractId);
    setSelectedContractName(contract.name);
    setBindingNotice(null);
    setSearchError(null);
    if (contract.priceType) {
      selectPriceType(contract.priceType, "Из договора");
      return;
    }
    setExternal1cPriceTypeId("");
    setSelectedPriceTypeName("");
    setSelectedPriceTypeSource("");
  }

  function selectPriceType(
    priceType: PartnerPriceTypeActionDto,
    source = "Выбрано вручную",
  ) {
    setExternal1cPriceTypeId(priceType.external1cPriceTypeId);
    setSelectedPriceTypeName(priceType.name);
    setSelectedPriceTypeSource(source);
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
        <h2 className="text-lg font-semibold text-zinc-950">
          Одобрение доступа
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          Найдите существующего партнёра в 1С. Ссылки заполняются автоматически
          и недоступны партнёру для изменения.
        </p>
        <div className="mt-5 grid gap-4">
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  Выбранный партнёр 1С
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  {selectedPartner
                    ? selectedPartner.displayName
                    : "Партнёр 1С не выбран."}
                </p>
              </div>
              <button
                className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
                onClick={() => setIsSearchOpen(true)}
                type="button"
              >
                Найти в 1С
              </button>
            </div>

            {selectedPartner && (
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <BindingValue
                  label="Ссылка партнёра в 1С"
                  value={external1cId}
                />
                <BindingValue
                  label="Ссылка договора в 1С"
                  value={external1cContractId}
                />
                <BindingValue
                  label="Ссылка статуса партнёра в 1С"
                  value={external1cPriceTypeId}
                />
                <BindingValue label="Договор" value={selectedContractName} />
                <BindingValue
                  label="Статус партнёра"
                  value={selectedPriceTypeName}
                />
                <BindingValue
                  label="Источник статуса партнёра"
                  value={selectedPriceTypeSource}
                />
              </dl>
            )}
          </div>
          <label className="grid gap-2 text-sm font-medium text-zinc-800">
            Комментарий к решению
            <textarea
              className="min-h-24 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-950"
              onChange={(event) => setDecisionReason(event.target.value)}
              value={decisionReason}
            />
          </label>
          <div className="grid gap-1 text-sm">
            {!external1cId && <p className="text-red-700">Выберите контрагента в 1С.</p>}
            {external1cId && !external1cPriceTypeId && <p className="text-red-700">Выберите статус партнёра.</p>}
            {selectedPartner && contracts.length === 0 && (
              <p className="text-zinc-600">Договор не обязателен, если активных договоров нет.</p>
            )}
          </div>
        </div>
        <button
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          disabled={
            isPending ||
            !external1cId ||
            !external1cPriceTypeId
          }
          type="submit"
        >
          {isPending ? "Одобрение..." : "Одобрить"}
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
                  Поиск в 1С
                </h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Поиск по названию компании, фискальному коду или ссылке 1С.
                </p>
              </div>
              <button
                className="text-sm font-medium text-zinc-600 hover:text-zinc-950"
                onClick={() => setIsSearchOpen(false)}
                type="button"
              >
                Закрыть
              </button>
            </div>

            <div className="mt-5 flex gap-2">
              <input
                className="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Название, фискальный код или ссылка 1С"
                value={searchQuery}
              />
              <button
                className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
                disabled={isPending}
                onClick={searchPartners}
                type="button"
              >
                Найти
              </button>
            </div>

            {searchError && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                {searchError}
              </p>
            )}

            {bindingNotice && (
              <p className="mt-3 whitespace-pre-line rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {bindingNotice}
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
                    {partner.fullName ?? "Полное наименование не указано"}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    Фискальный код: {partner.taxId ?? "Не указан"} · Код: {partner.code}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {partner.buyer ? "Покупатель" : "Не отмечен как покупатель"} ·{" "}
                    {partner.supplier ? "Поставщик" : "Не отмечен как поставщик"}
                  </p>
                  <button
                    className="mt-3 rounded-md border border-emerald-600 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
                    onClick={() => selectPartner(partner)}
                    type="button"
                  >
                    Выбрать контрагента
                  </button>
                </div>
              ))}

              {selectedPartner && contracts.length > 0 && (
                <div className="rounded-md border border-zinc-200 p-4">
                  <p className="font-medium text-zinc-950">
                    Активные договоры
                  </p>
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
                          {contract.number ?? contract.code} · {contract.date ?? "Дата не указана"} · {contract.contractType ?? "Тип договора не указан"}
                        </span>
                        <span className="mt-1 block text-zinc-600">
                          Статус партнёра: {contract.priceType?.name ?? "Требуется выбор"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedPartner && priceTypes.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
                  <p className="font-medium text-zinc-950">Выберите статус партнёра</p>
                  <div className="mt-3 grid gap-2">
                    {priceTypes.map((priceType) => (
                      <button
                        className="rounded-md border border-amber-300 bg-white px-3 py-2 text-left text-sm hover:border-emerald-600"
                        key={priceType.external1cPriceTypeId}
                        onClick={() => {
                          selectPriceType(priceType);
                        }}
                        type="button"
                      >
                        {priceType.name} · {priceType.external1cPriceTypeId}
                        {priceType.external1cPriceTypeId === external1cPriceTypeId ? " · Выбран" : ""}
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
        <h2 className="text-lg font-semibold text-zinc-950">
          Отклонение запроса
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          При отклонении компания и доступ к ней не создаются.
        </p>
        <label className="mt-5 grid gap-2 text-sm font-medium text-zinc-800">
          Причина отклонения
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
          {isPending ? "Отклонение..." : "Отклонить"}
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
      <dd className="mt-1 break-all text-zinc-600">
        {value || "Не выбрано"}
      </dd>
    </div>
  );
}
