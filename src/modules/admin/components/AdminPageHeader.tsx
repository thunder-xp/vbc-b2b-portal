import { PageHeader } from "../../platform-ui";

export function AdminPageHeader({
  description,
  eyebrow,
  title,
}: {
  description: string;
  eyebrow: string;
  title: string;
}) {
  return <PageHeader description={description} eyebrow={eyebrow} title={title} />;
}
