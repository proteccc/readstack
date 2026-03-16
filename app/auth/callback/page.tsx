"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  useEffect(() => {
    async function handleCallback() {
      const supabase = getSupabaseBrowserClient();
      const searchParams = new URLSearchParams(window.location.search);
      const next = searchParams.get("next") ?? "/";

      // 1. PKCE flow — code in search params (desktop browsers)
      const code = searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        window.location.replace(error ? "/login?error=auth_failed" : next);
        return;
      }

      // 2. token_hash flow — OTP token in search params
      const token_hash = searchParams.get("token_hash");
      const type = searchParams.get("type") as "magiclink" | "email" | null;
      if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash, type });
        window.location.replace(error ? "/login?error=auth_failed" : next);
        return;
      }

      // 3. Implicit flow — access_token in URL hash fragment (mobile WebViews)
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const access_token = hashParams.get("access_token");
      const refresh_token = hashParams.get("refresh_token");
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        window.location.replace(error ? "/login?error=auth_failed" : next);
        return;
      }

      // 4. Supabase may have auto-processed the hash already
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        window.location.replace(next);
        return;
      }

      window.location.replace("/login?error=missing_code");
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
