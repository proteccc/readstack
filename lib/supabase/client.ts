import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      throw new Error(
        "Supabase client is not configured. Make sure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set."
      );
    }

    // Use implicit flow so magic link emails contain token_hash instead of
    // a PKCE code. This makes sign-in work when the link is opened in a
    // different browser context (e.g. Gmail app WebView on mobile), which
    // doesn't share cookies/storage with the browser that requested the link.
    browserClient = createBrowserClient(url, anonKey, {
      auth: { flowType: "implicit" },
    });
  }

  return browserClient;
}

