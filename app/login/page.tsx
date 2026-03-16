'use client';

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "code_sent" | "verifying" | "error";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("error");
    if (e === "auth_failed") setError("The sign-in link may have expired or already been used. Try requesting a new code.");
    else if (e === "misconfigured") setError("Server configuration error. Please contact support.");
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
  }, [router]);

  async function handleSendCode(event: FormEvent<HTMLFormElement>) {
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
        options: { shouldCreateUser: true },
      });

      if (signInError) {
        setError(signInError.message);
        setStatus("error");
        return;
      }

      setStatus("code_sent");
    } catch {
      setError("Something went wrong while sending the code.");
      setStatus("error");
    }
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError("Please enter the code from your email.");
      setStatus("error");
      return;
    }

    setStatus("verifying");
    setError(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: trimmedCode,
        type: "email",
      });

      if (verifyError) {
        setError("Incorrect or expired code. Check your email and try again.");
        setStatus("code_sent");
        return;
      }

      router.replace("/");
    } catch {
      setError("Something went wrong while verifying the code.");
      setStatus("code_sent");
    }
  }

  if (status === "code_sent" || status === "verifying") {
    return (
      <div className="send-card">
        <div className="setup-card">
          <div style={{ display: "grid", gap: 4 }}>
            <h2 style={{ margin: 0, fontWeight: 700, letterSpacing: "-0.02em" }}>
              Check your email
            </h2>
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              We sent a 6-digit code to{" "}
              <strong style={{ color: "var(--text)" }}>{email}</strong>
            </p>
          </div>

          <form onSubmit={handleVerifyCode} style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <span className="setup-eyebrow">Enter code</span>
              <input
                className="setup-input"
                type="text"
                inputMode="numeric"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
                maxLength={6}
              />
            </div>

            {error && (
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#c0392b" }}>
                {error}
              </p>
            )}

            <button
              className="btn-primary"
              type="submit"
              disabled={status === "verifying"}
              style={{ marginTop: 4 }}
            >
              {status === "verifying" ? "Verifying…" : "Sign in →"}
            </button>
          </form>

          <div style={{ textAlign: "center" }}>
            <button
              className="btn-ghost"
              style={{ fontSize: "0.85rem" }}
              onClick={() => { setStatus("idle"); setCode(""); setError(null); }}
            >
              Use a different email
            </button>
          </div>
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

        <form onSubmit={handleSendCode} style={{ display: "grid", gap: 12 }}>
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
            {status === "sending" ? "Sending…" : "Send me a code →"}
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
