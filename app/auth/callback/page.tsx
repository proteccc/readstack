"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  useEffect(() => {
    async function handleCallback() {
      const supabase = getSupabaseBrowserClient();
      const searchParams = new URLSearchParams(window.location.search);

      // Supabase forwards errors (e.g. otp_expired) as query/hash params
      const error = searchParams.get("error");
      if (error) {
        window.location.replace("/login?error=auth_failed");
        return;
      }

      const rawNext = searchParams.get("next") ?? "/";
      // Only allow relative paths to prevent open redirect attacks.
      const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

      // PKCE flow — code in search params
      const code = searchParams.get("code");
      if (code) {
        const { error: err } = await supabase.auth.exchangeCodeForSession(code);
        window.location.replace(err ? "/login?error=auth_failed" : next);
        return;
      }

      // token_hash flow — OTP token in search params
      const token_hash = searchParams.get("token_hash");
      const type = searchParams.get("type") as "magiclink" | "email" | null;
      if (token_hash && type) {
        const { error: err } = await supabase.auth.verifyOtp({ token_hash, type });
        window.location.replace(err ? "/login?error=auth_failed" : next);
        return;
      }

      // Implicit flow — access_token in URL hash fragment
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const access_token = hashParams.get("access_token");
      const refresh_token = hashParams.get("refresh_token");
      if (access_token && refresh_token) {
        const { error: err } = await supabase.auth.setSession({ access_token, refresh_token });
        window.location.replace(err ? "/login?error=auth_failed" : next);
        return;
      }

      // Already signed in
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        window.location.replace(next);
        return;
      }

      window.location.replace("/login?error=auth_failed");
    }

    handleCallback();
  }, []);

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
