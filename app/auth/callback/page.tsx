"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    async function handleCallback() {
      const supabase = getSupabaseBrowserClient();

      const searchParams = new URLSearchParams(window.location.search);
      const token_hash = searchParams.get("token_hash");
      const type = searchParams.get("type") as "magiclink" | "email" | null;
      const code = searchParams.get("code");
      const next = searchParams.get("next") ?? "/";

      if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash, type });
        if (error) {
          router.replace(`/login?error=auth_failed`);
          return;
        }
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          router.replace(`/login?error=auth_failed`);
          return;
        }
      } else {
        // Implicit flow puts tokens in the hash — Supabase client auto-detects
        // and processes them. Just wait briefly then redirect.
        await new Promise((resolve) => setTimeout(resolve, 500));
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          router.replace(`/login?error=missing_code`);
          return;
        }
      }

      router.replace(next);
    }

    handleCallback();
  }, [router]);

  return (
    <div className="send-card">
      <div className="setup-card" style={{ textAlign: "center", gap: 16 }}>
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          Signing you in…
        </p>
      </div>
    </div>
  );
}
