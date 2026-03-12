'use client';

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "sent" | "error";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  // When the magic link redirects back to /login, Supabase attaches a code
  // in the URL. The browser client reads it, sets cookies, and we can then
  // send the user to the dashboard.
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/dashboard");
      }
    });
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Please enter an email address.");
      setStatus("error");
      return;
    }

    setStatus("sending");
    setError(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const {
        error: signInError,
      } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/login`
              : undefined,
        },
      });

      if (signInError) {
        setError(signInError.message);
        setStatus("error");
        return;
      }

      setStatus("sent");
    } catch {
      setError("Something went wrong while sending the login link.");
      setStatus("error");
    }
  }

  return (
    <div className="shell">
      <section className="hero">
        <div className="stack">
          <span className="eyebrow">Sign in</span>
          <h1>Sign in to Readstack</h1>
          <p>
            Enter your email to receive a one-time magic link. After you click
            it, this page will complete the sign-in and take you to the
            dashboard.
          </p>
        </div>
      </section>

      <section className="panel">
        <form className="stack" onSubmit={handleSubmit}>
          <label className="field">
            <strong>Email address</strong>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <button
            className="button"
            type="submit"
            disabled={status === "sending"}
          >
            {status === "sending" ? "Sending link..." : "Send magic link"}
          </button>

          {status === "sent" && (
            <p className="muted">
              Check your email for a sign-in link. Open it in this browser and
              you&apos;ll be redirected here first, then to the dashboard.
            </p>
          )}

          {status === "error" && error && (
            <p className="muted" style={{ color: "red" }}>
              {error}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}


