import { redirect } from "next/navigation";

export default function LegacyCompetitivePricingPage() {
  redirect("/admin/market-intelligence/price-lists");
}
