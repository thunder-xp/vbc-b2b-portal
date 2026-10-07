import {
  Award, BadgeCheck, BookOpen, Boxes, Building2, Calculator, CalendarClock,
  ClipboardList, Coins, Columns3, ContactRound, FileStack, FileText, FlaskConical,
  FolderHeart, FolderKanban, Gauge, Gift, GraduationCap, HardHat, Headset,
  Landmark, LayoutGrid, Layers3, LifeBuoy, Lightbulb, ListChecks, Megaphone,
  Microscope, SearchCheck, ShieldCheck, ShoppingBag, ShoppingCart, Sparkles,
  Star, UserRound, WalletCards, WandSparkles, Wrench, Zap, type LucideIcon,
} from "lucide-react";

import type { WorkspaceCapabilityKey } from "../services";

// Destination keys, including non-routed sidebar groups, share one icon owner.
export const partnerNavigationIconRegistry = {
  dashboard: { iconKey: "Gauge", Icon: Gauge },
  catalog: { iconKey: "Sparkles", Icon: Sparkles },
  catalog_full: { iconKey: "LayoutGrid", Icon: LayoutGrid },
  product_selection: { iconKey: "Zap", Icon: Zap },
  opportunities: { iconKey: "Lightbulb", Icon: Lightbulb },
  offers: { iconKey: "Megaphone", Icon: Megaphone },
  cart: { iconKey: "ShoppingCart", Icon: ShoppingCart },
  purchasing_lists: { iconKey: "Star", Icon: Star },
  purchase_templates: { iconKey: "Layers3", Icon: Layers3 },
  comparison: { iconKey: "Columns3", Icon: Columns3 },
  solution_selection: { iconKey: "SearchCheck", Icon: SearchCheck },
  projects: { iconKey: "FolderKanban", Icon: FolderKanban },
  reservations: { iconKey: "CalendarClock", Icon: CalendarClock },
  proposals: { iconKey: "Calculator", Icon: Calculator },
  customers: { iconKey: "ContactRound", Icon: ContactRound },
  nomenclature: { iconKey: "ClipboardList", Icon: ClipboardList },
  proposal_generator: { iconKey: "WandSparkles", Icon: WandSparkles },
  orders: { iconKey: "ListChecks", Icon: ListChecks },
  installation_marketplace: { iconKey: "Wrench", Icon: Wrench },
  installation_profile: { iconKey: "UserRound", Icon: UserRound },
  expertise_lab: { iconKey: "FlaskConical", Icon: FlaskConical },
  expertise_academy: { iconKey: "GraduationCap", Icon: GraduationCap },
  finance: { iconKey: "Landmark", Icon: Landmark },
  documents: { iconKey: "FileText", Icon: FileText },
  warranty: { iconKey: "BadgeCheck", Icon: BadgeCheck },
  support: { iconKey: "LifeBuoy", Icon: LifeBuoy },
  knowledge_base: { iconKey: "BookOpen", Icon: BookOpen },
  loyalty_affiliate: { iconKey: "Gift", Icon: Gift },
  loyalty_bonus: { iconKey: "Coins", Icon: Coins },
  company: { iconKey: "Building2", Icon: Building2 },
  products_group: { iconKey: "Boxes", Icon: Boxes },
  purchases_group: { iconKey: "ShoppingBag", Icon: ShoppingBag },
  collections_group: { iconKey: "FolderHeart", Icon: FolderHeart },
  estimates_group: { iconKey: "FileStack", Icon: FileStack },
  orders_finance_group: { iconKey: "WalletCards", Icon: WalletCards },
  installation_group: { iconKey: "HardHat", Icon: HardHat },
  project_protection_group: { iconKey: "ShieldCheck", Icon: ShieldCheck },
  expertise_group: { iconKey: "Microscope", Icon: Microscope },
  loyalty_group: { iconKey: "Award", Icon: Award },
  support_group: { iconKey: "Headset", Icon: Headset },
} as const satisfies Record<WorkspaceCapabilityKey, { iconKey: string; Icon: LucideIcon }> & Record<string, { iconKey: string; Icon: LucideIcon }>;

export type PartnerNavigationIconKey = keyof typeof partnerNavigationIconRegistry;
export const partnerNavigationIcons = Object.fromEntries(
  Object.entries(partnerNavigationIconRegistry).map(([key, value]) => [key, value.Icon]),
) as Record<PartnerNavigationIconKey, LucideIcon>;

// Compatibility aliases reference the registry; they do not select other icons.
export const catalogNavigationIcons = {
  showcase: partnerNavigationIcons.catalog,
  catalog: partnerNavigationIcons.catalog_full,
};
