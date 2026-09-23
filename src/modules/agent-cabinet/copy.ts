import type { AgentComplianceStatus, AgentReferralStatus, CommercialAgentLevel, CommercialAgentStatus } from "../agent-domain";

export type AgentCabinetLocale = "ru" | "ro";

export const agentReferralStatusCopy: Record<AgentCabinetLocale, Record<AgentReferralStatus, string>> = {
  ru: {
    CAPTURED: "Получена", PENDING_REVIEW: "На проверке", VERIFIED: "Проверена", ACTIVE: "Закреплена",
    DUPLICATE: "Уже зарегистрирована", EXISTING_CUSTOMER: "Клиент уже работает с Novotech",
    CONFLICT: "Требуется проверка", REJECTED: "Не подтверждена", EXPIRED: "Срок закрепления завершён",
    REASSIGNED: "Передана", TERMINATED: "Завершена",
  },
  ro: {
    CAPTURED: "Primită", PENDING_REVIEW: "În verificare", VERIFIED: "Verificată", ACTIVE: "Atribuită",
    DUPLICATE: "Deja înregistrată", EXISTING_CUSTOMER: "Client existent Novotech",
    CONFLICT: "Necesită verificare", REJECTED: "Neconfirmată", EXPIRED: "Protecție expirată",
    REASSIGNED: "Transferată", TERMINATED: "Încheiată",
  },
};

export const agentLifecycleStatusCopy: Record<AgentCabinetLocale, Record<CommercialAgentStatus, string>> = {
  ru: {
    APPLIED: "Заявка получена", COMPLIANCE_REVIEW: "Проверка данных", CONTRACT_PENDING: "Оформление договора",
    APPROVED: "Одобрен", TRAINING: "Обучение", ACTIVE: "Активен", SUSPENDED: "Доступ приостановлен",
    TERMINATED: "Сотрудничество завершено", REJECTED: "Заявка не одобрена",
  },
  ro: {
    APPLIED: "Cerere primită", COMPLIANCE_REVIEW: "Verificarea datelor", CONTRACT_PENDING: "Pregătirea contractului",
    APPROVED: "Aprobat", TRAINING: "Instruire", ACTIVE: "Activ", SUSPENDED: "Acces suspendat",
    TERMINATED: "Colaborare încheiată", REJECTED: "Cerere respinsă",
  },
};

export const agentComplianceCopy: Record<AgentCabinetLocale, Record<AgentComplianceStatus, string>> = {
  ru: {
    UNREVIEWED: "Не проверено", PENDING: "На проверке", APPROVED: "Подтверждено",
    REVIEW_REQUIRED: "Требуется проверка", BLOCKED: "Ограничено", REJECTED: "Не подтверждено",
  },
  ro: {
    UNREVIEWED: "Neverificat", PENDING: "În verificare", APPROVED: "Confirmat",
    REVIEW_REQUIRED: "Necesită verificare", BLOCKED: "Restricționat", REJECTED: "Neconfirmat",
  },
};

export const agentCabinetCopy = {
  ru: {
    cabinet: "Кабинет агента", role: "Коммерческий агент", home: "Главная", referrals: "Рекомендации", clients: "Клиенты", deals: "Сделки", rewards: "Вознаграждения", tools: "Инструменты", profile: "Профиль",
    commercialClients: "Клиенты", dealsInProgress: "Сделки в работе", expectedReward: "Ожидаемое вознаграждение", availablePayout: "Доступно к выплате",
    dealsTitle: "Сделки", dealsBody: "Продажи 1С, связанные с вашими подтверждёнными рекомендациями.", noDeals: "Связанных сделок пока нет.",
    rewardsTitle: "Вознаграждения", expected: "Ожидается", review: "На проверке", available: "Доступно к выплате", paid: "Выплачено", monthlyStatement: "История начислений", noRewards: "Начислений пока нет.",
    today: "Сегодня", primaryAction: "Создать рекомендацию", showQr: "Мой QR", activeReferrals: "Текущие рекомендации", allReferrals: "Все заявки", noReferrals: "Новых рекомендаций пока нет.",
    attention: "Следующий шаг", checkResult: "Проверьте результат рекомендации", open: "Открыть", share: "Привлечение клиентов", shareBody: "Покажите QR или отправьте персональную ссылку — рекомендация будет зафиксирована в системе.", materials: "Материалы", recentActivity: "Последние изменения", noActivity: "Здесь появятся изменения по вашим рекомендациям.",
    onboardingTitle: "Подготовка кабинета", onboardingBody: "Завершите текущий этап, чтобы открыть рабочие инструменты.", currentStage: "Текущий этап", verification: "Проверка", nextStep: "Следующий шаг", contactCoordinator: "Связаться с координатором Novotech",
  },
  ro: {
    cabinet: "Cabinetul agentului", role: "Agent comercial", home: "Acasă", referrals: "Recomandări", clients: "Clienți", deals: "Tranzacții", rewards: "Recompense", tools: "Instrumente", profile: "Profil",
    commercialClients: "Clienți", dealsInProgress: "Tranzacții în lucru", expectedReward: "Recompensă estimată", availablePayout: "Disponibil pentru plată",
    dealsTitle: "Tranzacții", dealsBody: "Vânzări 1C asociate recomandărilor dvs. confirmate.", noDeals: "Nu există tranzacții asociate.",
    rewardsTitle: "Recompense", expected: "Se estimează", review: "În verificare", available: "Disponibil pentru plată", paid: "Plătit", monthlyStatement: "Istoricul calculărilor", noRewards: "Nu există calculări.",
    today: "Astăzi", primaryAction: "Creează recomandare", showQr: "QR-ul meu", activeReferrals: "Recomandări curente", allReferrals: "Toate recomandările", noReferrals: "Nu există recomandări noi.",
    attention: "Următorul pas", checkResult: "Verificați rezultatul recomandării", open: "Deschide", share: "Atrageți clienți", shareBody: "Arătați codul QR sau trimiteți linkul personal — recomandarea va fi înregistrată în sistem.", materials: "Materiale", recentActivity: "Modificări recente", noActivity: "Aici vor apărea modificările recomandărilor dvs.",
    onboardingTitle: "Pregătirea cabinetului", onboardingBody: "Finalizați etapa curentă pentru a deschide instrumentele de lucru.", currentStage: "Etapa curentă", verification: "Verificare", nextStep: "Următorul pas", contactCoordinator: "Contactați coordonatorul Novotech",
  },
} as const;

export const agentEventCopy: Record<AgentCabinetLocale, Record<string, string>> = {
  ru: {
    REFERRAL_CAPTURED: "Рекомендация получена", REFERRAL_STATUS_CHANGED: "Статус рекомендации изменён",
    ATTRIBUTION_CREATED: "Клиент закреплён", ATTRIBUTION_EXTENDED: "Период защиты продлён",
    ATTRIBUTION_CONFLICT: "Требуется проверка закрепления", ATTRIBUTION_REASSIGNED: "Закрепление передано", ATTRIBUTION_TERMINATED: "Закрепление завершено",
  },
  ro: {
    REFERRAL_CAPTURED: "Recomandare primită", REFERRAL_STATUS_CHANGED: "Statutul recomandării s-a schimbat",
    ATTRIBUTION_CREATED: "Client atribuit", ATTRIBUTION_EXTENDED: "Perioada de protecție a fost prelungită",
    ATTRIBUTION_CONFLICT: "Atribuirea necesită verificare", ATTRIBUTION_REASSIGNED: "Atribuirea a fost transferată", ATTRIBUTION_TERMINATED: "Atribuirea s-a încheiat",
  },
};

export const referralStatusCopy = agentReferralStatusCopy.ru;
export const agentStatusCopy = agentLifecycleStatusCopy.ru;
export const levelCopy: Record<CommercialAgentLevel, string> = {
  START: "Старт", ACTIVE: "Активный", PROFESSIONAL: "Профессиональный", STRATEGIC: "Стратегический",
};
export const complianceCopy = agentComplianceCopy.ru;
