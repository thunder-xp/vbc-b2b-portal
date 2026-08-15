"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireAdminPermission } from "@/src/modules/admin/services";

import { getRetailCheckoutPilotRepository, hashRetailCheckoutPilotToken, RETAIL_CHECKOUT_PILOT_COOKIE } from "../retail-checkout-server";

const PILOT_DURATION_SECONDS = 2 * 60 * 60;
const ADMIN_PATH = "/admin/retail/installation";

export async function grantRetailCheckoutPilotAccessAction(formData: FormData) {
  await requireAdminPermission("admin.retail_marketplace.manage");
  const reason = String(formData.get("reason") ?? "").trim();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashRetailCheckoutPilotToken(token);
  if (!tokenHash || reason.length < 10) redirect(`${ADMIN_PATH}?pilot=invalid`);
  const expiresAt = new Date(Date.now() + PILOT_DURATION_SECONDS * 1000).toISOString();
  await getRetailCheckoutPilotRepository().issue({ tokenHash, expiresAt, reason });
  (await cookies()).set(RETAIL_CHECKOUT_PILOT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: PILOT_DURATION_SECONDS,
  });
  redirect(`${ADMIN_PATH}?pilot=granted`);
}

export async function revokeRetailCheckoutPilotAccessAction(formData: FormData) {
  await requireAdminPermission("admin.retail_marketplace.manage");
  const store = await cookies();
  const token = store.get(RETAIL_CHECKOUT_PILOT_COOKIE)?.value;
  const tokenHash = token ? hashRetailCheckoutPilotToken(token) : null;
  const reason = String(formData.get("reason") ?? "").trim();
  if (tokenHash && reason.length >= 10) await getRetailCheckoutPilotRepository().revoke({ tokenHash, reason });
  store.delete(RETAIL_CHECKOUT_PILOT_COOKIE);
  redirect(`${ADMIN_PATH}?pilot=revoked`);
}
