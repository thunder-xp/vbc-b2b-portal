import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId)) return unavailable();
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  const { data: storageKey, error } = await client.rpc("resolve_external_nomenclature_cover", { target_external_nomenclature_id: itemId });
  if (error || typeof storageKey !== "string") return unavailable();
  const { data: image, error: downloadError } = await createAdminClient().storage.from("partner-nomenclature-covers").download(storageKey);
  if (downloadError || !image) return unavailable();
  return new Response(await image.arrayBuffer(), { headers: {
    "Content-Type": "image/webp",
    "Cache-Control": "private, max-age=300",
    "Content-Security-Policy": "default-src 'none'",
    "X-Content-Type-Options": "nosniff",
  } });
}

function unavailable() {
  return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
