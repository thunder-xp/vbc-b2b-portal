import type { PublicLocale } from "@/src/modules/public-locale";

type AuthCopy = {
  signIn: {
    eyebrow: string;
    title: string;
    description: string;
    email: string;
    password: string;
    forgotPassword: string;
    becomePartner: string;
    submit: string;
    loading: string;
    invalidCredentials: string;
    requiredFields: string;
    genericError: string;
    registrationSuccess: string;
  };
  registration: {
    eyebrow: string;
    title: string;
    description: string;
    company: string;
    country: string;
    email: string;
    password: string;
    confirmPassword: string;
    submit: string;
    loading: string;
    alreadyRegistered: string;
    requiredFields: string;
    passwordMismatch: string;
    genericError: string;
  };
};

export const authCopy: Record<PublicLocale, AuthCopy> = {
  ru: {
    signIn: {
      eyebrow: "Партнёрская платформа Novotech",
      title: "Вход",
      description:
        "Войдите в кабинет компании, чтобы работать с каталогом, ценами и остатками.",
      email: "Электронная почта",
      password: "Пароль",
      forgotPassword: "Забыли пароль?",
      becomePartner: "Стать партнёром",
      submit: "Войти",
      loading: "Вход...",
      invalidCredentials: "Неверная электронная почта или пароль.",
      requiredFields: "Введите электронную почту и пароль.",
      genericError: "Не удалось выполнить вход. Попробуйте ещё раз.",
      registrationSuccess: "Аккаунт создан. Теперь войдите в систему.",
    },
    registration: {
      eyebrow: "Партнёрская платформа Novotech",
      title: "Стать партнёром",
      description:
        "Создайте аккаунт. Novotech проверит доступ компании перед активацией кабинета.",
      company: "Компания",
      country: "Страна",
      email: "Электронная почта",
      password: "Пароль",
      confirmPassword: "Подтвердите пароль",
      submit: "Создать аккаунт",
      loading: "Создание аккаунта...",
      alreadyRegistered: "Уже зарегистрированы? Войти",
      requiredFields: "Заполните все поля.",
      passwordMismatch: "Пароли не совпадают.",
      genericError: "Не удалось создать аккаунт. Попробуйте ещё раз.",
    },
  },
  ro: {
    signIn: {
      eyebrow: "Platforma Partenerilor Novotech",
      title: "Autentificare",
      description:
        "Autentificați-vă în cabinetul companiei pentru a lucra cu catalogul, prețurile și stocurile.",
      email: "Adresa de e-mail",
      password: "Parolă",
      forgotPassword: "Ați uitat parola?",
      becomePartner: "Devino partener",
      submit: "Autentificare",
      loading: "Se autentifică...",
      invalidCredentials: "Adresa de e-mail sau parola este incorectă.",
      requiredFields: "Introduceți adresa de e-mail și parola.",
      genericError: "Autentificarea nu a reușit. Încercați din nou.",
      registrationSuccess: "Contul a fost creat. Acum vă puteți autentifica.",
    },
    registration: {
      eyebrow: "Platforma Partenerilor Novotech",
      title: "Devino partener",
      description:
        "Creați un cont. Novotech va verifica accesul companiei înainte de activarea cabinetului.",
      company: "Companie",
      country: "Țară",
      email: "Adresa de e-mail",
      password: "Parolă",
      confirmPassword: "Confirmați parola",
      submit: "Creați contul",
      loading: "Se creează contul...",
      alreadyRegistered: "Aveți deja un cont? Autentificare",
      requiredFields: "Completați toate câmpurile.",
      passwordMismatch: "Parolele nu coincid.",
      genericError: "Contul nu a putut fi creat. Încercați din nou.",
    },
  },
};

export function localizeSignInError(locale: PublicLocale, error: string | null) {
  if (!error) return null;
  if (error === "Email or password is incorrect.") return authCopy[locale].signIn.invalidCredentials;
  if (error === "Enter your email and password.") return authCopy[locale].signIn.requiredFields;
  return authCopy[locale].signIn.genericError;
}

export function localizeRegistrationError(locale: PublicLocale, error: string | null) {
  if (!error) return null;
  if (error === "Complete all fields.") return authCopy[locale].registration.requiredFields;
  if (error === "Passwords do not match.") return authCopy[locale].registration.passwordMismatch;
  return authCopy[locale].registration.genericError;
}
