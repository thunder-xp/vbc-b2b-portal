import { EmptyState } from "@/src/modules/partner-cabinet/components";

export default function CabinetNotificationsPage() {
  return (
    <EmptyState
      message="The notification center is reserved for future order, reservation, document, and system events. No notification workflow is implemented in this slice."
      title="Notifications are not implemented yet"
    />
  );
}
