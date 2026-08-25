import type { WorkspaceCapabilityKey } from "../partner-cabinet/services";
import { partnerText, type PartnerTranslationKey } from "./copy";
import type { PartnerLocale } from "./locale";

const navigationKeys = {
  dashboard: "nav.dashboard",
  catalog: "nav.catalog",
  opportunities: "nav.opportunities",
  offers: "nav.offers",
  cart: "nav.cart",
  purchasing_lists: "nav.purchasing_lists",
  purchase_templates: "nav.purchase_templates",
  comparison: "nav.comparison",
  solution_selection: "nav.solution_selection",
  projects: "nav.projects",
  reservations: "nav.reservations",
  proposals: "nav.proposals",
  customers: "nav.customers",
  nomenclature: "nav.nomenclature",
  proposal_generator: "nav.proposal_generator",
  orders: "nav.orders",
  installation_orders: "nav.installation_orders",
  finance: "nav.finance",
  documents: "nav.documents",
  warranty: "nav.warranty",
  support: "nav.support",
  knowledge_base: "nav.knowledge_base",
  loyalty_affiliate: "nav.loyalty_affiliate",
  loyalty_bonus: "nav.loyalty_bonus",
  company: "nav.company",
} satisfies Record<WorkspaceCapabilityKey, PartnerTranslationKey>;

export function partnerNavigationLabel(locale: PartnerLocale, key: WorkspaceCapabilityKey): string {
  return partnerText(locale, navigationKeys[key]);
}
