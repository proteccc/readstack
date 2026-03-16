"use client";

import { useState, useEffect } from "react";

export type JobPhase = "processing" | "success" | "error";

export function useJobStatus(jobId: string | null) {
  const [phase, setPhase] = useState<JobPhase>("processing");
  const [failureReason, setFailureReason] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    // Reset state when a new job starts.
    setPhase("processing");
    setFailureReason(null);

    let done = false;

    async function check() {
      if (done) return;
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "completed") {
          done = true;
          setPhase("success");
        } else if (data.status === "failed") {
          done = true;
          setPhase("error");
          setFailureReason(data.failureReason ?? null);
        }
      } catch {
        // Network error — keep polling.
      }
    }

    const poll = setInterval(check, 2000);

    // Mobile browsers suspend setInterval when the tab is backgrounded.
    // Re-check immediately when the user returns to the tab.
    function onVisible() {
      if (document.visibilityState === "visible") check();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [jobId]);

  return { phase, failureReason };
}
