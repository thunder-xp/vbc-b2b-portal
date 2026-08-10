export const NOMENCLATURE_COVER_MAX_SOURCE_BYTES = 2 * 1024 * 1024;
export const NOMENCLATURE_COVER_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function nomenclatureCoverFileError(file: { size: number; type: string } | null | undefined): string | null {
  if (!file) return "Выберите изображение.";
  if (file.size < 1 || file.size > NOMENCLATURE_COVER_MAX_SOURCE_BYTES) return "Размер файла не должен превышать 2 МБ.";
  if (!(NOMENCLATURE_COVER_ACCEPTED_TYPES as readonly string[]).includes(file.type)) return "Используйте корректное JPG, PNG или WebP изображение.";
  return null;
}
