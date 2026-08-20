import { redirect } from "next/navigation";

export default function WarehouseReplenishmentPage() {
  redirect("/cabinet/catalog?collection=replenishment");
}
