import { runNextJob, recoverStaleJobs } from "./run-job";

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? "5000", 10);

let running = true;

// Graceful shutdown: finish the current job then exit.
process.on("SIGTERM", () => {
  console.log("SIGTERM received — shutting down after current job.");
  running = false;
});

async function main() {
  console.log(`Worker started. Polling every ${POLL_INTERVAL_MS / 1000}s.`);
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? "set" : "MISSING"}`);
  console.log(`RESEND_API_KEY: ${process.env.RESEND_API_KEY ? "set" : "MISSING"}`);
  console.log(`READSTACK_FROM_EMAIL: ${process.env.READSTACK_FROM_EMAIL ?? "MISSING"}`);

  await recoverStaleJobs();

  while (running) {
    try {
      const ran = await runNextJob();
      if (!ran) {
        // Nothing queued — wait before polling again.
        await sleep(POLL_INTERVAL_MS);
      }
      // If a job ran, immediately poll again in case more are queued.
    } catch (err) {
      console.error("Unexpected error in poll loop:", err);
      await sleep(POLL_INTERVAL_MS);
    }
  }

  console.log("Worker stopped.");
  process.exit(0);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("Worker failed to start:", err);
  process.exit(1);
});
