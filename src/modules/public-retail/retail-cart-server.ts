import "server-only";
import { SupabaseRetailCartRepository } from "./repositories/supabase/retail-cart.supabase-repository";
import { RetailCartService } from "./services/retail-cart.service";
const service = new RetailCartService(new SupabaseRetailCartRepository());
export function getRetailCartService() { return service; }
