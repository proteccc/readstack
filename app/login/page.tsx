'use client';

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "sent" | "error";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
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
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/auth/callback`
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

  if (status === "sent") {
    return (
      <div className="send-card">
        <div className="setup-card" style={{ textAlign: "center", gap: 16 }}>
          <div style={{ fontSize: "2rem" }}>✉️</div>
          <div style={{ display: "grid", gap: 6 }}>
            <strong style={{ fontSize: "1.05rem" }}>Check your email</strong>
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              We sent a sign-in link to{" "}
              <strong style={{ color: "var(--text)" }}>{email}</strong>
            </p>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
            Click the link in that email and you&apos;ll be signed in. The link
            expires in 1 hour.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="send-card">
      <div className="setup-card">
        <div style={{ display: "grid", gap: 4 }}>
          <h2 style={{ margin: 0, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Sign in
          </h2>
          <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
            New here? We&apos;ll create your account automatically.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <span className="setup-eyebrow">Email address</span>
            <input
              className="setup-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
            />
          </div>

          {status === "error" && error && (
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#c0392b" }}>
              {error}
            </p>
          )}

          <button
            className="btn-primary"
            type="submit"
            disabled={status === "sending"}
            style={{ marginTop: 4 }}
          >
            {status === "sending" ? "Sending…" : "Send me a link →"}
          </button>
        </form>

        <div style={{ textAlign: "center" }}>
          <Link href="/" className="btn-ghost" style={{ fontSize: "0.85rem" }}>
            Continue without account
          </Link>
        </div>
      </div>
    </div>
  );
}
