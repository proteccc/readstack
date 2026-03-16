import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Handles the OAuth/magic-link PKCE callback from Supabase.
 *
 * Supabase's PKCE flow (the default in v2+) redirects the user here with a
 * one-time `code` param. We exchange that code for a session server-side,
 * which writes the session cookies and then redirects to the dashboard.
 *
 * Without this route, magic link sign-in can fail silently in browsers that
 * block third-party cookies or clear state between tabs.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  // Railway (and most reverse proxies) forward the real public hostname via
  // x-forwarded-host. Falling back to request.url would give localhost:8080.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : new URL(request.url).origin;

  const next = searchParams.get("next") ?? "/";

  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return NextResponse.redirect(`${origin}/login?error=misconfigured`);
  }

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        cookieStore.set(name, value, options);
      },
      remove(name: string, options: CookieOptions) {
        cookieStore.set(name, "", { ...options, maxAge: 0 });
      },
    },
  });

  // Mobile email apps open magic links in a new WebView that doesn't carry
  // the PKCE verifier cookie from the original browser tab. Supabase falls
  // back to sending token_hash + type in that case. Handle both flows.
  if (tokenHash && type) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as any });
    if (error) {
      console.error("Auth callback verifyOtp error:", error.message);
      return NextResponse.redirect(`${origin}/login?error=auth_failed`);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("Auth callback exchangeCode error:", error.message);
      return NextResponse.redirect(`${origin}/login?error=auth_failed`);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=missing_code`);
}
