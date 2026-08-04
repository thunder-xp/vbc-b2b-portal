"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  failureFromError,
  success,
  type ActionResult,
} from "../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../access-control/actions/service-factory";
import { createPartnerWorkspaceContextService } from "../partner-cabinet/actions/service-factory";
import { requireAdminPermission } from "../admin/services/admin-workspace.service";
import { SupabaseKnowledgeRepository } from "./supabase.repository";
import { KnowledgeService } from "./service";
import type {
  KnowledgeArticle,
  KnowledgeCard,
  KnowledgeLanding,
} from "./types";

const service = new KnowledgeService(new SupabaseKnowledgeRepository());
async function companyId() {
  const userId = await getAuthenticatedUserId();
  const context =
    await createPartnerWorkspaceContextService().getWorkspaceContext(userId);
  if (!context.companyId || context.accessState !== "active")
    throw new Error("Knowledge access denied.");
  return context.companyId;
}
export async function getKnowledgeLandingAction(): Promise<
  ActionResult<KnowledgeLanding | null>
> {
  try {
    return success(
      "База знаний загружена.",
      await service.landing(await companyId()),
    );
  } catch (error) {
    return failureFromError(error);
  }
}
export async function searchKnowledgeAction(
  query: string,
  source = "landing",
): Promise<ActionResult<KnowledgeCard[]>> {
  try {
    return success(
      "Поиск завершён.",
      await service.search(
        await companyId(),
        query,
        source,
        source === "support" || source === "service" ? 3 : 20,
      ),
    );
  } catch (error) {
    return failureFromError(error);
  }
}
export async function getKnowledgeArticleAction(
  slug: string,
): Promise<ActionResult<KnowledgeArticle | null>> {
  try {
    const article = await service.article(await companyId(), slug);
    if (article) await service.recordView(await companyId(), article.id);
    return success("Материал загружен.", article);
  } catch (error) {
    return failureFromError(error);
  }
}
export async function getProductKnowledgeAction(productId: string) {
  try {
    return success(
      "Материалы загружены.",
      await service.productArticles(await companyId(), productId),
    );
  } catch (error) {
    return failureFromError(error);
  }
}
export async function submitKnowledgeFeedbackAction(
  _: unknown,
  form: FormData,
) {
  try {
    await service.feedback(
      await companyId(),
      String(form.get("articleId")),
      form.get("helpful") === "true",
      String(form.get("reason") || "") || null,
    );
    return success("Спасибо за оценку.", null);
  } catch (error) {
    return failureFromError(error);
  }
}
export async function recordKnowledgeSuggestionAction(
  articleId: string,
  query: string,
  source: "support" | "service",
  outcome: string,
) {
  try {
    const hash = createHash("sha256")
      .update(query.trim().toLowerCase().replace(/\s+/g, " "))
      .digest("hex");
    await service.suggestionOutcome(
      await companyId(),
      articleId,
      hash,
      source,
      outcome,
    );
    return success("Событие записано.", null);
  } catch (error) {
    return failureFromError(error);
  }
}
export async function listAdminKnowledgeAction(
  status: string | null,
  query: string,
  page: number,
) {
  await requireAdminPermission("knowledge.edit");
  return service.adminList(status, query, page);
}
export async function getAdminKnowledgeAction(articleId: string) {
  await requireAdminPermission("knowledge.edit");
  return service.adminGet(articleId);
}
export async function getKnowledgeEditorOptionsAction() {
  await requireAdminPermission("knowledge.edit");
  return service.editorOptions();
}
export async function saveKnowledgeArticleAction(
  _: unknown,
  form: FormData,
): Promise<ActionResult<null>> {
  try {
    await requireAdminPermission(
      String(form.get("articleId") || "")
        ? "knowledge.edit"
        : "knowledge.create",
    );
    const id = await service.adminSave(form);
    revalidatePath("/admin/knowledge");
    redirect(`/admin/knowledge/${id}`);
  } catch (error) {
    return failureFromError(error);
  }
}
export async function transitionKnowledgeArticleAction(
  _: unknown,
  form: FormData,
) {
  try {
    const action = String(form.get("action"));
    const permission =
      action === "publish"
        ? "knowledge.publish"
        : action === "submit_review"
          ? "knowledge.review"
          : "knowledge.archive";
    await requireAdminPermission(permission);
    const result = await service.adminTransition(
      String(form.get("articleId")),
      action,
      Number(form.get("version")),
      String(form.get("reason") || "") || null,
    );
    revalidatePath("/admin/knowledge");
    return success("Статус обновлён.", result);
  } catch (error) {
    return failureFromError(error);
  }
}
export async function getKnowledgeDiagnosticsAction() {
  await requireAdminPermission("knowledge.analytics.view");
  return service.diagnostics();
}
