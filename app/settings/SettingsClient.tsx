'use client';

import { FormEvent, useState } from "react";

type Status = "idle" | "saving" | "saved" | "error";

interface Props {
  kindleEmail: string;
  secondaryEmail: string;
}

export function SettingsClient({ kindleEmail: initial, secondaryEmail: initialSecondary }: Props) {
  const [kindleEmail, setKindleEmail] = useState(initial);
  const [secondaryEmail, setSecondaryEmail] = useState(initialSecondary);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage(null);

    try {
      const response = await fetch("/api/settings/destinations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kindleEmail, secondaryEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus("error");
        setMessage(data.message ?? "Failed to save settings.");
        return;
      }

      setStatus("saved");
      setMessage("Settings saved.");
    } catch {
      setStatus("error");
      setMessage("Something went wrong while saving.");
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <label className="field">
        <strong>Kindle email</strong>
        <span className="muted">
          Your Kindle&apos;s send-to address, e.g. name_abc123@kindle.com
        </span>
        <input
          type="email"
          required
          placeholder="you@kindle.com"
          value={kindleEmail}
          onChange={(e) => setKindleEmail(e.target.value)}
        />
      </label>

      <label className="field">
        <strong>
          Secondary email <span className="muted">(optional)</span>
        </strong>
        <span className="muted">
          Receive a copy of each send for your own records.
        </span>
        <input
          type="email"
          placeholder="you@example.com"
          value={secondaryEmail}
          onChange={(e) => setSecondaryEmail(e.target.value)}
        />
      </label>

      <button className="button" type="submit" disabled={status === "saving"}>
        {status === "saving" ? "Saving…" : "Save settings"}
      </button>

      {message && (
        <p
          className="muted"
          style={{ color: status === "error" ? "red" : "inherit" }}
        >
          {message}
        </p>
      )}
    </form>
  );
}
