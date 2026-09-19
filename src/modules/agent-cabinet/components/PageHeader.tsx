import type { ReactNode } from "react";
import { WorkspaceHeader, cabinetPrimaryAction, cabinetSecondaryAction } from "@/src/modules/cabinet-experience/components";

export function AgentPageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <WorkspaceHeader actions={actions} description={description} title={title}/>;
}

export const primaryButton = cabinetPrimaryAction;
export const secondaryButton = cabinetSecondaryAction;
