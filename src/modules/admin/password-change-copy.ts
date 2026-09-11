import type { PartnerLocale } from "../partner-locale";

export type AdminPartnerPasswordErrorCode =
  | "PASSWORD_REQUIRED"
  | "PASSWORD_POLICY"
  | "PASSWORD_MISMATCH"
  | "INVALID_TARGET"
  | "TARGET_NOT_SUPPORTED"
  | "TARGET_COMPANY_AMBIGUOUS"
  | "AUTH_MAPPING_MISSING"
  | "AUTH_PROVIDER_REJECTED"
  | "AUDIT_FAILED_AFTER_CHANGE"
  | "PERMISSION_DENIED"
  | "SYSTEM_ERROR";

const COPY = {
  ru: {
    sectionTitle: "Доступ и безопасность",
    action: "Сменить пароль",
    dialogTitle: "Сменить пароль",
    consequence: "После сохранения активные сеансы пользователя будут завершены.",
    newPassword: "Новый пароль",
    confirmPassword: "Повторите пароль",
    showPassword: "Показать пароль",
    hidePassword: "Скрыть пароль",
    save: "Сохранить новый пароль",
    saving: "Сохранение…",
    cancel: "Отмена",
    close: "Закрыть",
    success: "Пароль изменён. Активные сессии пользователя завершены.",
    partial: "Пароль изменён и сеансы завершены, но обязательный аудит не записан. Передайте код обращения администратору платформы.",
    errors: {
      PASSWORD_REQUIRED: "Введите новый пароль.",
      PASSWORD_POLICY: "Пароль должен содержать не менее 8 символов.",
      PASSWORD_MISMATCH: "Пароли не совпадают.",
      INVALID_TARGET: "Пользователь недоступен для смены пароля.",
      TARGET_NOT_SUPPORTED: "Смена пароля недоступна для этой учётной записи.",
      TARGET_COMPANY_AMBIGUOUS: "Не удалось однозначно определить компанию пользователя.",
      AUTH_MAPPING_MISSING: "Учётная запись пользователя не связана с Auth.",
      AUTH_PROVIDER_REJECTED: "Сервис авторизации не принял новый пароль. Проверьте требования и повторите попытку.",
      AUDIT_FAILED_AFTER_CHANGE: "Пароль изменён и сеансы завершены, но обязательный аудит не записан.",
      PERMISSION_DENIED: "Недостаточно прав для смены пароля.",
      SYSTEM_ERROR: "Не удалось сменить пароль.",
    },
  },
  ro: {
    sectionTitle: "Acces și securitate",
    action: "Schimbă parola",
    dialogTitle: "Schimbă parola",
    consequence: "După salvare, sesiunile active ale utilizatorului vor fi închise.",
    newPassword: "Parolă nouă",
    confirmPassword: "Repetați parola",
    showPassword: "Arată parola",
    hidePassword: "Ascunde parola",
    save: "Salvează parola nouă",
    saving: "Se salvează…",
    cancel: "Anulează",
    close: "Închide",
    success: "Parola a fost schimbată. Sesiunile active ale utilizatorului au fost închise.",
    partial: "Parola a fost schimbată și sesiunile au fost închise, dar auditul obligatoriu nu a fost înregistrat. Transmiteți codul solicitării administratorului platformei.",
    errors: {
      PASSWORD_REQUIRED: "Introduceți parola nouă.",
      PASSWORD_POLICY: "Parola trebuie să conțină cel puțin 8 caractere.",
      PASSWORD_MISMATCH: "Parolele nu coincid.",
      INVALID_TARGET: "Utilizatorul nu este disponibil pentru schimbarea parolei.",
      TARGET_NOT_SUPPORTED: "Schimbarea parolei nu este disponibilă pentru acest cont.",
      TARGET_COMPANY_AMBIGUOUS: "Compania utilizatorului nu a putut fi identificată fără ambiguitate.",
      AUTH_MAPPING_MISSING: "Contul utilizatorului nu este asociat cu Auth.",
      AUTH_PROVIDER_REJECTED: "Serviciul de autentificare nu a acceptat parola nouă. Verificați cerințele și încercați din nou.",
      AUDIT_FAILED_AFTER_CHANGE: "Parola a fost schimbată și sesiunile au fost închise, dar auditul obligatoriu nu a fost înregistrat.",
      PERMISSION_DENIED: "Nu aveți permisiunea de a schimba parola.",
      SYSTEM_ERROR: "Parola nu a putut fi schimbată.",
    },
  },
} as const;

export function adminPartnerPasswordCopy(locale: PartnerLocale) {
  return COPY[locale];
}
