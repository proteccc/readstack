"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useJobStatus } from "@/hooks/useJobStatus";
import { ErrorCodes } from "@/lib/error-codes";

interface RecentJob {
  id: string;
  title: string | null;
  sourceUrl: string;
  status: string;
  createdAt: string;
}

interface Props {
  // Passed from server: set when user is signed in and has a Kindle configured.
  serverKindleEmail?: string | null;
  recentJobs?: RecentJob[];
  isSignedIn?: boolean;
}

type Step =
  | { kind: "idle" }
  | { kind: "setup_email" }
  | { kind: "setup_whitelist"; kindleEmail: string }
  | { kind: "processing"; jobId: string; sourceUrl: string }
  | { kind: "success"; sourceUrl: string }
  | { kind: "error"; failureReason: string | null; sourceUrl: string };

const FROM_EMAIL = process.env.NEXT_PUBLIC_READSTACK_FROM_EMAIL ?? "readstack@read-stack.com";

const LS_KEY = "rs_kindle_email";
const SESSION_JOB_KEY = "rs_active_job";

function getErrorContent(reason: string | null) {
  if (reason === ErrorCodes.FETCH_UNSUPPORTED) {
    return {
      colorClass: "amber",
      label: "Unsupported site",
      heading: "This site can't be converted",
      body: "X/Twitter, Instagram, Facebook, and TikTok require a login to read and can't be fetched. Try a direct article link instead.",
      action: "Try a different URL",
      retry: false,
    };
  }
  if (
    reason === ErrorCodes.FETCH_BAD_URL ||
    reason === ErrorCodes.FETCH_PAYWALLED ||
    reason === ErrorCodes.FETCH_BLOCKED ||
    reason === ErrorCodes.FETCH_ERROR
  ) {
    return {
      colorClass: "amber",
      label: "Couldn't fetch article",
      heading: "Article unavailable",
      body: "This may be paywalled or the URL may not point to a valid article.",
      action: "Try a different URL",
      retry: false,
    };
  }
  if (reason === ErrorCodes.CONVERT_ERROR) {
    return {
      colorClass: "amber",
      label: "Conversion failed",
      heading: "Couldn't create your EPUB",
      body: "There was a formatting issue on our end.",
      action: "Try again",
      retry: true,
    };
  }
  // SMTP_ERROR or unknown
  return {
    colorClass: "red",
    label: "Delivery failed",
    heading: "Couldn't send to your Kindle",
    body: (
      <>
        Make sure{" "}
        <code style={{ fontWeight: 700 }}>{FROM_EMAIL}</code> is
        in your Amazon approved senders list (Manage Your Content &amp; Devices
        → Preferences → Personal Document Settings).
      </>
    ),
    action: "Try again",
    retry: true,
  };
}

// Animate through pipeline steps based on elapsed time.
function usePipelineStep(active: boolean) {
  const [step, setStep] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) { setStep(0); return; }
    timerRef.current = setTimeout(() => setStep(1), 4000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [active]);

  useEffect(() => {
    if (step !== 1) return;
    timerRef.current = setTimeout(() => setStep(2), 9000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [step]);

  return step; // 0=fetching, 1=converting, 2=sending
}

function PipelineStep({
  label,
  state,
}: {
  label: string;
  state: "done" | "active" | "pending";
}) {
  return (
    <div className="pipeline-step">
      <div className={`pipeline-icon ${state}`}>
        {state === "done" ? "✓" : state === "active" ? "·" : ""}
      </div>
      <span style={{ color: state === "pending" ? "var(--muted)" : "inherit" }}>
        {label}
      </span>
    </div>
  );
}

export function SendForm({ serverKindleEmail, recentJobs = [], isSignedIn = false }: Props) {
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [url, setUrl] = useState("");
  const [kindleEmailInput, setKindleEmailInput] = useState("");
  const [kindleEmail, setKindleEmail] = useState<string | null>(serverKindleEmail ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [platform, setPlatform] = useState<"Desktop" | "Mobile">("Desktop");

  // Read Kindle email from localStorage on mount (for returning guests).
  useEffect(() => {
    if (!kindleEmail) {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) setKindleEmail(stored);
    }
  }, [kindleEmail]);

  // Restore an in-progress job from sessionStorage on mount (handles mobile
  // navigation away to click magic link and back).
  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_JOB_KEY);
    if (saved) {
      try {
        const { jobId, sourceUrl } = JSON.parse(saved);
        setStep({ kind: "processing", jobId, sourceUrl });
      } catch {
        sessionStorage.removeItem(SESSION_JOB_KEY);
      }
    }
  }, []);

  // Persist active job / clear on completion.
  useEffect(() => {
    if (step.kind === "processing") {
      sessionStorage.setItem(SESSION_JOB_KEY, JSON.stringify({ jobId: step.jobId, sourceUrl: step.sourceUrl }));
    } else if (step.kind === "success" || step.kind === "error") {
      sessionStorage.removeItem(SESSION_JOB_KEY);
    }
  }, [step]);

  const jobId = step.kind === "processing" ? step.jobId : null;
  const { phase, failureReason, manualCheck } = useJobStatus(jobId);

  // Transition out of processing when job completes.
  useEffect(() => {
    if (step.kind !== "processing") return;
    if (phase === "success") setStep({ kind: "success", sourceUrl: step.sourceUrl });
    if (phase === "error")
      setStep({ kind: "error", failureReason, sourceUrl: step.sourceUrl });
  }, [phase, failureReason, step]);

  const pipelineAnimStep = usePipelineStep(step.kind === "processing");

  async function submit(urlToSend: string, kindle: string) {
    setSubmitting(true);
    try {
      const endpoint = isSignedIn ? "/api/jobs" : "/api/jobs/guest";
      const body = isSignedIn
        ? { url: urlToSend }
        : { url: urlToSend, kindleEmail: kindle };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.jobId) {
        setStep({ kind: "error", failureReason: null, sourceUrl: urlToSend });
        return;
      }
      setStep({ kind: "processing", jobId: data.jobId, sourceUrl: urlToSend });
    } catch {
      setStep({ kind: "error", failureReason: null, sourceUrl: urlToSend });
    } finally {
      setSubmitting(false);
    }
  }

  function handleSendClick() {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!kindleEmail) {
      setStep({ kind: "setup_email" });
      return;
    }
    submit(trimmed, kindleEmail);
  }

  function handleSetupEmailNext() {
    const trimmed = kindleEmailInput.trim();
    if (!trimmed) return;
    setStep({ kind: "setup_whitelist", kindleEmail: trimmed });
  }

  function handleSendNow() {
    if (step.kind !== "setup_whitelist") return;
    const kindle = step.kindleEmail;
    localStorage.setItem(LS_KEY, kindle);
    setKindleEmail(kindle);
    submit(url.trim(), kindle);
  }

  function reset(keepUrl = false) {
    setStep({ kind: "idle" });
    if (!keepUrl) setUrl("");
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (step.kind === "success") {
    return (
      <div className="send-card" style={{ paddingTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div className="success-icon">📖</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>
              On its way to your Kindle
            </div>
            <div className="muted" style={{ fontSize: "0.85rem", marginTop: 2 }}>
              Usually arrives in 1–2 minutes.
            </div>
          </div>
        </div>

        {!isSignedIn && (
          <div className="nudge-box">
            <strong>Never set up again</strong>
            <p>
              Save your Kindle connection and send history across all your
              devices.
            </p>
            <Link href="/login">
              <button className="btn-cta">Create account →</button>
            </Link>
          </div>
        )}

        <button className="btn-ghost" onClick={() => reset()}>
          Send another article
        </button>
      </div>
    );
  }

  if (step.kind === "error") {
    const err = getErrorContent(step.failureReason);
    return (
      <div className="send-card" style={{ paddingTop: 24 }}>
        <div className={`error-label ${err.colorClass}`}>
          <span>●</span> {err.label}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>{err.heading}</div>
          <div className="muted" style={{ fontSize: "0.88rem", marginTop: 6, lineHeight: 1.5 }}>
            {err.body}
          </div>
        </div>
        <button
          className="btn-primary"
          style={{ borderRadius: 999 }}
          onClick={() => {
            if (err.retry) {
              setStep({ kind: "idle" });
              setUrl(step.sourceUrl);
            } else {
              reset();
            }
          }}
        >
          {err.action}
        </button>
      </div>
    );
  }

  if (step.kind === "processing") {
    const steps: Array<{ label: string; state: "done" | "active" | "pending" }> = [
      {
        label: "Fetched article",
        state: pipelineAnimStep >= 1 ? "done" : "active",
      },
      {
        label: "Generating EPUB…",
        state:
          pipelineAnimStep >= 2 ? "done" : pipelineAnimStep === 1 ? "active" : "pending",
      },
      {
        label: "Sending email",
        state: pipelineAnimStep >= 2 ? "active" : "pending",
      },
    ];

    return (
      <div className="send-card" style={{ paddingTop: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {kindleEmail && (
            <div className="chip chip-green" style={{ alignSelf: "flex-start" }}>
              <span className="chip-dot" />
              {kindleEmail}
            </div>
          )}
          <div>
            <div className="chip chip-amber" style={{ marginBottom: 6 }}>
              <span className="chip-dot" />
              Converting article…
            </div>
            <div className="muted" style={{ fontSize: "0.82rem" }}>
              Fetching &amp; generating EPUB
            </div>
          </div>
        </div>
        <div className="pipeline">
          {steps.map((s) => (
            <PipelineStep key={s.label} label={s.label} state={s.state} />
          ))}
        </div>
        <button
          type="button"
          className="btn-ghost"
          onClick={manualCheck}
          style={{ fontSize: "0.82rem", alignSelf: "center", marginTop: 4 }}
        >
          Tap to check status
        </button>
      </div>
    );
  }

  if (step.kind === "setup_email" || step.kind === "setup_whitelist") {
    const onStep1 = step.kind === "setup_email";
    return (
      <div className="send-card" style={{ paddingTop: 8 }}>
        {/* Step 1 */}
        <div className={`setup-card ${!onStep1 ? "dimmed" : ""}`}>
          <div className="setup-eyebrow">Quick setup · Step 1 of 2</div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              Your Kindle email address
            </div>
            <div className="muted" style={{ fontSize: "0.83rem" }}>
              Found in Kindle or{" "}
              <a
                href="https://www.amazon.com/sendtokindle/email"
                target="_blank"
                rel="noopener noreferrer"
              >
                Amazon.com
              </a>
              : All Settings → Your account → Send-to-Kindle email
            </div>
          </div>
          {onStep1 && (
            <>
              <input
                className="setup-input"
                type="email"
                placeholder="yourname_xx@kindle.com"
                value={kindleEmailInput}
                onChange={(e) => setKindleEmailInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSetupEmailNext()}
                autoFocus
              />
              <button
                className="btn-primary"
                style={{ borderRadius: 999 }}
                onClick={handleSetupEmailNext}
                disabled={!kindleEmailInput.trim()}
              >
                Next →
              </button>
            </>
          )}
          {!onStep1 && step.kind === "setup_whitelist" && (
            <div style={{ fontSize: "0.88rem", color: "var(--muted)" }}>
              {step.kindleEmail}
            </div>
          )}
        </div>

        {/* Step 2 */}
        <div className={`setup-card ${onStep1 ? "dimmed" : ""}`}>
          <div className="setup-eyebrow">Step 2 · Permission to send</div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              Add us to Amazon&apos;s approved senders{" "}
              <a
                href="https://www.amazon.com/gp/help/customer/display.html?nodeId=GX9XLEVV8G4DB28H"
                target="_blank"
                rel="noopener noreferrer"
              >
                ↗
              </a>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {(["Desktop", "Mobile"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  style={{
                    fontSize: "0.75rem",
                    padding: "2px 10px",
                    borderRadius: 999,
                    border: "1px solid currentColor",
                    background: platform === p ? "var(--fg, #1a1a1a)" : "transparent",
                    color: platform === p ? "var(--bg, #fff)" : "inherit",
                    cursor: "pointer",
                    opacity: platform === p ? 1 : 0.45,
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="muted" style={{ fontSize: "0.83rem", lineHeight: 1.5 }}>
              {platform === "Desktop" ? (
                <>Amazon Account → Preferences → Personal Document Settings → Approved Personal Email List, and add:</>
              ) : (
                <>Amazon app → tap the menu (☰) → Account → Manage Content &amp; Devices → Preferences → Personal Document Settings → Approved Personal Document E-mail List, and add:</>
              )}
            </div>
          </div>
          {!onStep1 && (
            <>
              <code className="whitelist-address">
                {FROM_EMAIL}
              </code>
              <div className="whitelist-warning">
                Or articles won&apos;t arrive — Amazon silently blocks unknown
                senders.
              </div>
              <button
                className="btn-primary"
                style={{ borderRadius: 999 }}
                onClick={handleSendNow}
                disabled={submitting}
              >
                {submitting ? "Sending…" : "Send now →"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Idle state ────────────────────────────────────────────────────────────
  const connected = !!kindleEmail;

  return (
    <>
      <div
        style={{
          width: "min(580px, calc(100% - 32px))",
          margin: "0 auto 20px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            margin: "0 0 8px",
            fontSize: "clamp(1.7rem, 5vw, 2.4rem)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1.15,
          }}
        >
          Any Substack post,<br />on your Kindle.
        </h1>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "1rem" }}>
          Paste a URL. We&apos;ll convert it and send it in seconds.
        </p>
      </div>

    <div className="send-card">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        <div
          className={`chip ${connected ? "chip-green" : "chip-amber"}`}
        >
          <span className="chip-dot" />
          {connected ? kindleEmail : "Kindle not connected"}
        </div>
      </div>

      <div className="url-row">
        <input
          className="url-input"
          type="url"
          placeholder="https://substack.com/p/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSendClick()}
        />
        <button
          className="btn-primary"
          onClick={handleSendClick}
          disabled={submitting || !url.trim()}
        >
          Send to Kindle →
        </button>
      </div>

      {!connected && (
        <p className="send-helper">
          Tapping send will walk you through a one-time 2-minute setup.
        </p>
      )}

      {recentJobs.length > 0 && (
        <div className="recent-sends">
          <div className="recent-label">Recent sends</div>
          {recentJobs.map((job) => (
            <div className="recent-item" key={job.id}>
              <span className="recent-title">
                {job.title ?? job.sourceUrl}
              </span>
              <span
                className={`recent-status ${
                  job.status === "completed"
                    ? "sent"
                    : job.status === "failed"
                    ? "failed"
                    : "sending"
                }`}
              >
                {job.status === "completed"
                  ? "Sent"
                  : job.status === "failed"
                  ? "Failed"
                  : "Sending…"}
              </span>
            </div>
          ))}
        </div>
      )}

      {!isSignedIn && recentJobs.length === 0 && (
        <div className="nudge-box" style={{ marginTop: 4 }}>
          <strong>Never set up again</strong>
          <p>
            Save your Kindle connection and send history across all your devices.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/login" style={{ flex: 1 }}>
              <button className="btn-cta" style={{ background: "#3d1f8a" }}>
                Create account →
              </button>
            </Link>
            <Link href="/login" style={{ flex: 1 }}>
              <button
                className="btn-cta"
                style={{ background: "transparent", color: "var(--text)", border: "1px solid var(--line)" }}
              >
                Sign in
              </button>
            </Link>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
