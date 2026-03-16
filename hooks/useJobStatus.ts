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

    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) return; // keep polling on transient errors
        const data = await res.json();

        // Both "queued" and "running" mean still in-progress — keep polling.
        if (data.status === "completed") {
          setPhase("success");
          clearInterval(poll);
        } else if (data.status === "failed") {
          setPhase("error");
          setFailureReason(data.failureReason ?? null);
          clearInterval(poll);
        }
      } catch {
        // Network error — keep polling.
      }
    }, 2000);

    return () => clearInterval(poll);
  }, [jobId]);

  return { phase, failureReason };
}
