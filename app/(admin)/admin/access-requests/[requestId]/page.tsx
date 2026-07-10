import { redirect } from "next/navigation";

type AdminAccessRequestCompatibilityDetailPageProps = {
  params: Promise<{
    requestId: string;
  }>;
};

export default async function AdminAccessRequestCompatibilityDetailPage({
  params,
}: AdminAccessRequestCompatibilityDetailPageProps) {
  const { requestId } = await params;

  redirect(`/admin/partner-requests/${requestId}`);
}
