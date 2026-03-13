import { PrismaClient } from "@prisma/client";
import { spawn } from "child_process";
import path from "path";

const db = new PrismaClient();

// Root of the repo — where Readstack.java and the ./readstack launcher live.
const REPO_ROOT = path.resolve(__dirname, "..");

export async function runNextJob(): Promise<boolean> {
  // Find the oldest queued job.
  const job = await db.job.findFirst({
    where: { status: "queued" },
    include: {
      user: {
        include: { destinations: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!job) {
    return false; // nothing to do
  }

  // Claim it atomically. If another worker instance grabbed it first this
  // update will still succeed (there is no optimistic locking here), but the
  // poll interval keeps concurrent races unlikely in practice.
  await db.job.update({
    where: { id: job.id },
    data: { status: "running", startedAt: new Date() },
  });

  console.log(`[job ${job.id}] running: ${job.sourceUrl}`);

  // Resolve the user's delivery destinations.
  const kindleDest = job.user.destinations.find((d) => d.kind === "kindle");
  if (!kindleDest) {
    await fail(job.id, "No Kindle destination configured for this user.");
    return true;
  }

  const recipients: string[] = [kindleDest.email];
  const emailDest = job.user.destinations.find((d) => d.kind === "email");
  if (emailDest) {
    recipients.push(emailDest.email);
  }

  try {
    await runPipeline(job.sourceUrl, recipients);
    await db.job.update({
      where: { id: job.id },
      data: { status: "completed", completedAt: new Date() },
    });
    console.log(`[job ${job.id}] completed`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await fail(job.id, reason);
    console.error(`[job ${job.id}] failed: ${reason}`);
  }

  return true;
}

function runPipeline(url: string, recipients: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      // Override recipient list with this job's user destinations. The Java
      // pipeline reads READSTACK_RECIPIENT_EMAILS and sends to all addresses.
      READSTACK_RECIPIENT_EMAILS: recipients.join(", "),
    };

    // The ./readstack shell script compiles + runs the Java pipeline. It does
    // `cd "$(dirname "$0")"` internally, so we run it from REPO_ROOT.
    const proc = spawn("./readstack", [url, "--send"], {
      cwd: REPO_ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(`  > ${text}`);
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        // Prefer stderr for the error message; fall back to stdout tail.
        const detail = stderr.trim() || stdout.trim() || `exit code ${code}`;
        reject(new Error(detail));
      }
    });

    proc.on("error", reject);
  });
}

async function fail(jobId: string, reason: string): Promise<void> {
  await db.job.update({
    where: { id: jobId },
    data: {
      status: "failed",
      failureReason: reason,
      completedAt: new Date(),
    },
  });
}
