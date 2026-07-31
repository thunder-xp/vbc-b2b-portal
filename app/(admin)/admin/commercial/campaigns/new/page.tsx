import { AdminPageHeader } from "@/src/modules/admin/components";
import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { createCommercialCampaignService } from "@/src/modules/commercial-campaigns/actions";
import { CampaignBuilder } from "@/src/modules/commercial-campaigns/components";

export default async function NewCampaignPage() {
  await requireAdminPagePermission("campaigns.create");
  const options = await createCommercialCampaignService().getBuilderOptions();
  return <div className="space-y-6"><AdminPageHeader description="Четыре этапа: условия, товары, управляемая аудитория и проверка. Цены остаются в read model 1С." eyebrow="Коммерческие кампании" title="Новая кампания" /><CampaignBuilder options={options} /></div>;
}
