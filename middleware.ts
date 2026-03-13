import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Runs on every non-static request. Creates a Supabase client with full
 * cookie read/write access so that access tokens are refreshed automatically
 * before they expire. Without this, sessions silently die after ~1 hour.
 */
export async function middleware(request: NextRequest) {
  // We rebuild the response object when cookies are written so the
  // updated Set-Cookie headers are forwarded to the browser.
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If env vars are missing, pass the request through rather than crashing
  // every page. The app's own error handling covers the missing-config case.
  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        // Cookie writes require rebuilding the response so Next.js forwards
        // the new Set-Cookie header to the browser.
        request.cookies.set({ name, value, ...options } as Parameters<typeof request.cookies.set>[0]);
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        response.cookies.set({ name, value, ...options } as Parameters<typeof response.cookies.set>[0]);
      },
      remove(name: string, options: Record<string, unknown>) {
        request.cookies.set({ name, value: "", ...options } as Parameters<typeof request.cookies.set>[0]);
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        response.cookies.set({ name, value: "", ...options } as Parameters<typeof response.cookies.set>[0]);
      },
    },
  });

  // Calling getUser() triggers a token refresh if the access token is close
  // to expiring. The refreshed token is written back via the cookie handlers
  // above and forwarded to the browser in the response.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Run on all routes except Next.js internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
