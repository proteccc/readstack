"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const LS_KEY = "rs_kindle_email";

export function GuestMigration({ isSignedIn }: { isSignedIn: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!isSignedIn) return;

    const stored = localStorage.getItem(LS_KEY);
    if (!stored) return;

    fetch("/api/migrate-kindle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kindleEmail: stored }),
    })
      .then((res) => {
        if (res.ok) {
          localStorage.removeItem(LS_KEY);
          router.refresh();
        }
      })
      .catch(() => {
        // Network error — leave localStorage intact so we can retry next time.
      });
  }, [isSignedIn, router]);

  return null;
}
