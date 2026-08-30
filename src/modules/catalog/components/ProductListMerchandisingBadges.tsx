import { Flame, Sparkles, TrendingUp, type LucideIcon } from "lucide-react";

import type { MerchandisingLabelCode } from "../../merchandising/types";
import { MerchandisingBadge } from "./MerchandisingBadges";

const ICONS: Record<"HOT" | "NEW" | "TOP", LucideIcon> = {
  HOT: Flame,
  NEW: Sparkles,
  TOP: TrendingUp,
};

export function ProductListMerchandisingBadges({
  labelOverrides,
  labels = [],
  productCollectionsLabel,
}: {
  labelOverrides: Record<"HOT" | "NEW" | "TOP", string>;
  labels?: MerchandisingLabelCode[];
  productCollectionsLabel: string;
}) {
  const visible = [...new Set(labels)].filter(isListRowIconCode).slice(0, 2);
  if (!visible.length) return null;

  return <div aria-label={productCollectionsLabel} className="flex flex-wrap gap-1.5">{visible.map((code) => {
    const Icon = ICONS[code];
    return <MerchandisingBadge icon={<Icon aria-hidden="true" className="size-3.5" />} key={code} label={labelOverrides[code]} variant={code} />;
  })}</div>;
}

function isListRowIconCode(code: MerchandisingLabelCode): code is "HOT" | "NEW" | "TOP" {
  return code === "HOT" || code === "NEW" || code === "TOP";
}
