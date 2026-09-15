import "server-only";
import { InstallationMarketplaceService } from "./service";
import { SupabaseInstallationMarketplaceRepository } from "./supabase.repository";

const repository = new SupabaseInstallationMarketplaceRepository();
const service = new InstallationMarketplaceService(repository);
export function getInstallationMarketplaceService() { return service; }
