import { redirect } from "next/navigation";

import { AuthPageShell, RegisterForm } from "@/src/modules/auth/components";
import type { ProfessionalRegistrationIntent } from "@/src/modules/auth/redirects";
import { publicRetailLocale } from "@/src/modules/public-retail/presentation";

type Params = Promise<{ intent: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ProfessionalRegisterPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ intent: rawIntent }, query] = await Promise.all([params, searchParams]);
  const locale = publicRetailLocale(query.lang);
  const intent = professionalIntent(rawIntent);

  if (!intent) redirect(`/become-partner?lang=${locale}`);

  const ru = locale === "ru";
  const roleCopy = intent === "agent"
    ? {
        title: ru ? "Регистрация коммерческого агента" : "Înregistrare agent comercial",
        description: ru
          ? "Создайте аккаунт, чтобы подать заявку на участие в агентской программе Novotech."
          : "Creați un cont pentru a depune cererea de participare la programul de agenți comerciali Novotech.",
      }
    : {
        title: ru ? "Регистрация профессионального инсталлятора" : "Înregistrare instalator profesionist",
        description: ru
          ? "Создайте аккаунт, чтобы подать заявку на профессиональное сотрудничество с Novotech."
          : "Creați un cont pentru a depune cererea de colaborare profesională cu Novotech.",
      };

  return (
    <AuthPageShell
      backHref={`/become-partner?lang=${locale}`}
      backLabel={ru ? "Назад к выбору" : "Înapoi la alegere"}
      description={roleCopy.description}
      eyebrow="Novotech Systems Distribution"
      homeHref={`/?lang=${locale}`}
      maxWidth="lg"
      title={roleCopy.title}
    >
      <RegisterForm intent={intent} locale={locale} />
    </AuthPageShell>
  );
}

function professionalIntent(value: string): ProfessionalRegistrationIntent | null {
  return value === "agent" || value === "installer" ? value : null;
}
