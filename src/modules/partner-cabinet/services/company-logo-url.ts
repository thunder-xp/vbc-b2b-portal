export function companyLogoUrl(assetPath: string | null): string | null {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!assetPath || !baseUrl) return null;
  const encodedPath = assetPath.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl.replace(/\/$/, "")}/storage/v1/render/image/public/company-logos/${encodedPath}?width=128&height=96&resize=contain&quality=70`;
}
