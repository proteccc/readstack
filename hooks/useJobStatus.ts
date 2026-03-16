"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type JobPhase = "processing" | "success" | "error";

export function useJobStatus(jobId: string | null) {
  const [phase, setPhase] = useState<JobPhase>("processing");
  const [failureReason, setFailureReason] = useState<string | null>(null);

  // Stable ref so the manual check button can trigger a poll without
  // needing to be inside the effect closure.
  const checkRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!jobId) return;

    setPhase("processing");
    setFailureReason(null);

    let intervalId: ReturnType<typeof setInterval>;

    async function check() {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "completed") {
          clearInterval(intervalId);
          document.removeEventListener("visibilitychange", onVisible);
          setPhase("success");
        } else if (data.status === "failed") {
          clearInterval(intervalId);
          document.removeEventListener("visibilitychange", onVisible);
          setPhase("error");
          setFailureReason(data.failureReason ?? null);
        }
      } catch {
        // Network error — keep polling.
      }
    }

    checkRef.current = check;

    function onVisible() {
      if (document.visibilityState === "visible") check();
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    // Check immediately, then every 2s.
    check();
    intervalId = setInterval(check, 2000);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      checkRef.current = () => {};
    };
  }, [jobId]);

  const manualCheck = useCallback(() => checkRef.current(), []);

  return { phase, failureReason, manualCheck };
}
