"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const FROM_EMAIL = "readstack@dispatchpigeon.com";

interface Props {
  userEmail: string;
  kindleEmail: string;
}

function AccountRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: "12px 0",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <span style={{ fontSize: "0.83rem", color: "var(--muted)", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: "0.9rem", textAlign: "right", minWidth: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>{children}</span>
    </div>
  );
}

export function SettingsClient({ userEmail, kindleEmail: initial }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(!initial);
  const [kindleInput, setKindleInput] = useState(initial);
  const [kindleEmail, setKindleEmail] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const trimmed = kindleInput.trim();
    if (!trimmed) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/settings/destinations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kindleEmail: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json();
        setSaveError(data.message ?? "Failed to save.");
        return;
      }
      setKindleEmail(trimmed);
      setEditing(false);
    } catch {
      setSaveError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="send-card">
      <div className="setup-card">
        <h2 style={{ margin: 0, fontWeight: 700, letterSpacing: "-0.02em" }}>Account</h2>

        <div style={{ marginTop: 4 }}>
          <AccountRow label="Signed in as">{userEmail}</AccountRow>

          <AccountRow label="Kindle email">
            {editing ? null : (
              <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, overflow: "hidden" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                  {kindleEmail || <span style={{ color: "var(--muted)" }}>Not set</span>}
                </span>
                <button
                  className="btn-ghost"
                  style={{ fontSize: "0.8rem", flexShrink: 0 }}
                  onClick={() => { setKindleInput(kindleEmail); setEditing(true); }}
                >
                  Edit
                </button>
              </span>
            )}
          </AccountRow>

          {editing && (
            <form onSubmit={handleSave} style={{ padding: "12px 0", display: "grid", gap: 10 }}>
              <span className="setup-eyebrow">Kindle email</span>
              <input
                className="setup-input"
                type="email"
                placeholder="yourname_xx@kindle.com"
                value={kindleInput}
                onChange={(e) => setKindleInput(e.target.value)}
                autoFocus
                required
              />
              {saveError && (
                <p style={{ margin: 0, fontSize: "0.85rem", color: "#c0392b" }}>{saveError}</p>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn-primary" style={{ borderRadius: 999 }} type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
                {initial && (
                  <button
                    className="btn-ghost"
                    type="button"
                    onClick={() => { setKindleInput(kindleEmail); setEditing(false); }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}

          <AccountRow label="Approved sender">
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <code style={{ fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{FROM_EMAIL}</code>
              <span
                style={{
                  background: "rgba(34, 120, 60, 0.1)",
                  color: "#22783c",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 999,
                  whiteSpace: "nowrap",
                }}
              >
                ✓ Whitelisted
              </span>
            </span>
          </AccountRow>
        </div>

        <div style={{ paddingTop: 8 }}>
          <button className="btn-ghost" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
