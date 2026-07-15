"use server";

import { revalidatePath } from "next/cache";
import { failureFromError, invalidInput, success, type ActionResult } from "../../access-control/actions/action-result";
import { createCompanyAccessService, getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { SupabaseCatalogFavoriteRepository, SupabaseCatalogRepository } from "../repositories/supabase";
import { DefaultCatalogFavoriteService, DefaultCatalogService } from "../services";

export async function getCatalogFavoriteStateAction(productId: string): Promise<ActionResult<boolean>> {
  if (!isPortalUuid(productId)) return invalidInput();
  try { return success("Favorite state loaded.", await createService().getState(await getAuthenticatedUserId(), productId)); }
  catch (error) { return failureFromError(error); }
}

export async function toggleCatalogFavoriteAction(productId: string, slug: string): Promise<ActionResult<boolean>> {
  if (!isPortalUuid(productId) || !slug.trim()) return invalidInput();
  try {
    const favorite = await createService().toggle(await getAuthenticatedUserId(), productId);
    revalidatePath(`/cabinet/catalog/${slug.trim()}`);
    return success(favorite ? "Товар добавлен в избранное." : "Товар удалён из избранного.", favorite);
  } catch (error) { return failureFromError(error); }
}

function createService(): DefaultCatalogFavoriteService {
  const access = createCompanyAccessService();
  return new DefaultCatalogFavoriteService(new SupabaseCatalogFavoriteRepository(), access, new DefaultCatalogService(new SupabaseCatalogRepository(), access));
}

function isPortalUuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim()); }
