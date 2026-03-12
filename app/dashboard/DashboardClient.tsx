'use client';

import { FormEvent, useState } from "react";

type Status = "idle" | "submitting" | "success" | "error";

export function DashboardClient() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = url.trim();

    if (!trimmed) {
      setStatus("error");
      setMessage("Please enter an article URL.");
      return;
    }

    setStatus("submitting");
    setMessage(null);

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus("error");
        setMessage(data.message ?? "Failed to create job.");
        return;
      }

      setStatus("success");
      setMessage("Job created. This page will later show real-time status.");
      setUrl("");
    } catch {
      setStatus("error");
      setMessage("Something went wrong while creating the job.");
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <label className="field">
        <strong>Article URL</strong>
        <span className="muted">
          Paste any Substack (or similar article) URL you want to send.
        </span>
        <input
          type="url"
          required
          placeholder="https://substack.com/..."
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>

      <button className="button" type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Creating job…" : "Create job"}
      </button>

      {message && (
        <p className="muted" style={{ color: status === "error" ? "red" : "inherit" }}>
          {message}
        </p>
      )}
    </form>
  );
}


