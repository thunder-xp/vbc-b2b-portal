"use client";

import { createBrowserClient } from "@supabase/ssr";

function readPublicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY") {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required public environment variable: ${name}`);
  }

  return value;
}

export function createClient() {
  return createBrowserClient(
    readPublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    readPublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}
