"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function NavUser() {
  const [signedIn, setSignedIn] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <>
      {/* Desktop nav links */}
      {signedIn ? (
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Link href="/" className={`nav-link${pathname === "/" ? " nav-link-active" : ""}`}>
            Send
          </Link>
          <Link href="/history" className={`nav-link${pathname === "/history" ? " nav-link-active" : ""}`}>
            History
          </Link>
          <Link href="/settings" className={`nav-link${pathname === "/settings" ? " nav-link-active" : ""}`}>
            Account
          </Link>
          <button
            onClick={handleSignOut}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--muted)",
              fontFamily: "inherit",
              fontSize: "0.88rem",
              padding: "5px 8px",
            }}
          >
            Sign out
          </button>
        </div>
      ) : (
        <Link href="/login" className="nav-link">
          Sign in
        </Link>
      )}

    </>
  );
}
