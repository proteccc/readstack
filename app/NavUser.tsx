'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Renders the auth-aware portion of the nav bar.
 *
 * Uses the browser Supabase client so session state is read directly from the
 * cookie — no network call required. This keeps the root layout free of any
 * server-side auth overhead that would slow down every page render.
 */
export function NavUser() {
  const [email, setEmail] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (email) {
    return (
      <>
        <span className="muted" style={{ marginRight: "0.75rem" }}>
          Signed in as {email}
        </span>
        <button className="button-secondary" onClick={handleSignOut}>
          Sign out
        </button>
      </>
    );
  }

  return (
    <a href="/login" style={{ textDecoration: "none" }}>
      Sign in
    </a>
  );
}
