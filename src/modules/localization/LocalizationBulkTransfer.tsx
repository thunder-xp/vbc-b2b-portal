"use client";

import { useRef, useState, useTransition } from "react";

import {
  exportLocalizationAction,
  importLocalizationAction,
  previewLocalizationImportAction,
} from "./actions";
import type { LocalizationEntityType } from "./types";

export function LocalizationBulkTransfer({ canManage, entityType }: {
  canManage: boolean;
  entityType: LocalizationEntityType;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [payload, setPayload] = useState("");
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Array<{ row: number; reason: string | null; sourceName: string | null }>>([]);
  const [canImport, setCanImport] = useState(false);
  const [pending, startTransition] = useTransition();

  const exportRows = () => startTransition(async () => {
    const result = await exportLocalizationAction({
      entityType,
      limit: 100,
      status: entityType === "product" ? "missing" : undefined,
    });
    setMessage(result.message);
    if (!result.success || !result.payload) return;
    const blob = new Blob([result.payload], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `localization-ro-${entityType}-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  });

  const selectFile = async (file: File | undefined) => {
    setCanImport(false);
    setErrors([]);
    setMessage("");
    if (!file || file.size > 512_000) {
      setPayload("");
      setFileName("");
      setMessage("Выберите JSON-файл размером до 500 КБ.");
      return;
    }
    setPayload(await file.text());
    setFileName(file.name);
  };

  const preview = () => startTransition(async () => {
    const result = await previewLocalizationImportAction(payload);
    setMessage(result.success && result.preview
      ? `${result.message} Корректно: ${result.preview.validCount}; ошибок: ${result.preview.invalidCount}.`
      : result.message);
    setErrors(result.success && result.preview ? result.preview.rows.filter((row) => !row.valid).slice(0, 10) : []);
    setCanImport(Boolean(result.success && result.preview?.invalidCount === 0));
  });

  const applyImport = () => startTransition(async () => {
    const result = await importLocalizationAction(payload);
    setMessage(result.message);
    if (result.success) {
      setPayload("");
      setFileName("");
      setCanImport(false);
      setErrors([]);
      if (inputRef.current) inputRef.current.value = "";
    }
  });

  if (!canManage) return null;
  return <section className="border border-zinc-200 bg-white p-4" aria-labelledby="localization-transfer-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold" id="localization-transfer-title">Пакетная локализация</h2><p className="mt-1 text-xs text-zinc-500">JSON, максимум 100 записей. Импорт применяется только после полной проверки.</p></div>
      <button className="min-h-11 border border-zinc-300 bg-white px-4 text-sm font-semibold disabled:opacity-50" disabled={pending} onClick={exportRows} type="button">Экспортировать {entityType === "category" ? "категории" : "100 приоритетных товаров"}</button>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <input accept="application/json,.json" className="block min-h-11 max-w-full text-sm" onChange={(event)=>void selectFile(event.target.files?.[0])} ref={inputRef} type="file" />
      <button className="min-h-11 border border-zinc-300 bg-white px-4 text-sm font-semibold disabled:opacity-50" disabled={pending || !payload} onClick={preview} type="button">Проверить файл</button>
      <button className="min-h-11 bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={pending || !canImport} onClick={applyImport} type="button">Импортировать</button>
    </div>
    <p aria-live="polite" className="mt-3 min-h-5 text-xs text-zinc-600">{fileName ? `${fileName}. ` : ""}{message}</p>
    {errors.length ? <ul className="mt-2 space-y-1 text-xs text-red-700">{errors.map((error)=><li key={error.row}>Строка {error.row}{error.sourceName ? ` (${error.sourceName})` : ""}: {importReason(error.reason)}</li>)}</ul> : null}
  </section>;
}

function importReason(reason: string | null) {
  return ({
    INVALID_ENTITY_ID: "некорректный ID", INVALID_ENTITY_TYPE: "некорректный тип",
    INVALID_LOCALE: "поддерживается только RO", INVALID_STATUS: "допустим черновик или проверено",
    ENTITY_NOT_PUBLIC_OR_UNKNOWN: "объект не найден в публичном каталоге",
    SOURCE_HASH_MISMATCH: "исходные данные изменились", CONTENT_INCOMPLETE: "не заполнены обязательные поля",
  } as Record<string, string>)[reason ?? ""] ?? "ошибка проверки";
}
