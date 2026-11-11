import type {CookieOptions} from "@supabase/ssr";
// Public project identifiers. This is a publishable key, never a service-role key.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "unconfigured";
export const rememberCookie = "rpg-remember";
export function sessionCookieOptions(options: CookieOptions, remember: boolean, secure: boolean): CookieOptions {
  const next:CookieOptions = {...options, path: "/", httpOnly: true, sameSite: "lax", secure};
  // Retain explicit deletion; otherwise an unchecked preference means a session cookie.
  if (!remember && options.maxAge !== 0) { delete next.maxAge; delete next.expires; }
  return next;
}
