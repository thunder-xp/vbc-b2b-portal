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
    confirmationSuccess: string;
  };
  registration: {
    eyebrow: string;
    title: string;
    description: string;
    legalForm: string;
    individual: string;
    legalEntity: string;
    email: string;
    password: string;
    confirmPassword: string;
    submit: string;
    loading: string;
    alreadyRegistered: string;
    requiredFields: string;
    passwordMismatch: string;
    genericError: string;
    emailDeliveryUnavailable: string;
    required: string;
  };
};

export const authCopy: Record<PublicLocale, AuthCopy> = {
  ru: {
    signIn: {
      eyebrow: "Novotech Systems Distribution",
      title: "Вход в личный кабинет",
      description: "Введите электронную почту и пароль.",
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
      confirmationSuccess: "Email подтверждён. Войдите, чтобы продолжить регистрацию.",
    },
    registration: {
      eyebrow: "Партнёрская платформа Novotech",
      title: "Стать партнёром",
      description:
        "Создайте аккаунт. Novotech проверит доступ компании перед активацией кабинета.",
      legalForm: "Форма деятельности",
      individual: "Физическое лицо",
      legalEntity: "Юридическое лицо",
      email: "Электронная почта",
      password: "Пароль",
      confirmPassword: "Подтвердите пароль",
      submit: "Создать аккаунт",
      loading: "Создание аккаунта...",
      alreadyRegistered: "Уже зарегистрированы? Войти",
      requiredFields: "Заполните все поля.",
      passwordMismatch: "Пароли не совпадают.",
      genericError: "Не удалось создать аккаунт. Попробуйте ещё раз.",
      emailDeliveryUnavailable: "\u041d\u0435\u0020\u0443\u0434\u0430\u043b\u043e\u0441\u044c\u0020\u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c\u0020\u043f\u0438\u0441\u044c\u043c\u043e\u0020\u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u044f\u002e\u0020\u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435\u0020\u0435\u0449\u0451\u0020\u0440\u0430\u0437\u002e",
      required: "обязательно",
    },
  },
  ro: {
    signIn: {
      eyebrow: "Novotech Systems Distribution",
      title: "Autentificare în contul personal",
      description: "Introduceți adresa de e-mail și parola.",
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
      confirmationSuccess: "Adresa de e-mail a fost confirmată. Autentificați-vă pentru a continua înregistrarea.",
    },
    registration: {
      eyebrow: "Platforma Partenerilor Novotech",
      title: "Devino partener",
      description:
        "Creați un cont. Novotech va verifica accesul companiei înainte de activarea cabinetului.",
      legalForm: "Forma de activitate",
      individual: "Persoană fizică",
      legalEntity: "Persoană juridică",
      email: "Adresa de e-mail",
      password: "Parolă",
      confirmPassword: "Confirmați parola",
      submit: "Creați contul",
      loading: "Se creează contul...",
      alreadyRegistered: "Aveți deja un cont? Autentificare",
      requiredFields: "Completați toate câmpurile.",
      passwordMismatch: "Parolele nu coincid.",
      genericError: "Contul nu a putut fi creat. Încercați din nou.",
      emailDeliveryUnavailable: "\u0045\u002d\u006d\u0061\u0069\u006c\u0075\u006c\u0020\u0064\u0065\u0020\u0063\u006f\u006e\u0066\u0069\u0072\u006d\u0061\u0072\u0065\u0020\u006e\u0075\u0020\u0061\u0020\u0070\u0075\u0074\u0075\u0074\u0020\u0066\u0069\u0020\u0074\u0072\u0069\u006d\u0069\u0073\u002e\u0020\u00ce\u006e\u0063\u0065\u0072\u0063\u0061\u021b\u0069\u0020\u0064\u0069\u006e\u0020\u006e\u006f\u0075\u002e",
      required: "obligatoriu",
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
  if (error === "Confirmation email could not be sent.") return authCopy[locale].registration.emailDeliveryUnavailable;
  return authCopy[locale].registration.genericError;
}
