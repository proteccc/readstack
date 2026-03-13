import { runNextJob } from "./run-job";

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? "5000", 10);

async function main() {
  console.log(`Worker started. Polling every ${POLL_INTERVAL_MS / 1000}s.`);
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? "set" : "MISSING"}`);
  console.log(`READSTACK_SMTP_EMAIL: ${process.env.READSTACK_SMTP_EMAIL ?? "MISSING"}`);
  console.log(`READSTACK_SMTP_PASSWORD: ${process.env.READSTACK_SMTP_PASSWORD ? "set" : "MISSING"}`);

  while (true) {
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
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("Worker failed to start:", err);
  process.exit(1);
});
