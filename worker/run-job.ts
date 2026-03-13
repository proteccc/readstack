import { PrismaClient } from "@prisma/client";
import { spawn } from "child_process";
import path from "path";
import { generateAndSend } from "./epub/node";

const db = new PrismaClient();

// Root of the repo — where Readstack.java and the ./readstack launcher live.
const REPO_ROOT = path.resolve(__dirname, "..");

// EPUB_GENERATOR controls which conversion path is used:
//   "node"    — Java fetches/cleans HTML, Node generates EPUB via epub-gen-memory
//   "calibre" — Java runs the full pipeline including Calibre (original behavior)
// Defaults to "node". Set EPUB_GENERATOR=calibre in .env to revert at any time.
const EPUB_GENERATOR = (process.env.EPUB_GENERATOR ?? "node").toLowerCase();

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

  // Claim the job. A race between two worker instances is unlikely given the
  // poll interval, but the worst case is a duplicate send rather than data loss.
  await db.job.update({
    where: { id: job.id },
    data: { status: "running", startedAt: new Date() },
  });

  console.log(`[job ${job.id}] running (${EPUB_GENERATOR}): ${job.sourceUrl}`);

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
    if (EPUB_GENERATOR === "calibre") {
      await runCalrePipeline(job.sourceUrl, recipients);
    } else {
      await runNodePipeline(job.sourceUrl, recipients);
    }

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

/**
 * Node pipeline: Java fetches, cleans, and writes HTML to disk via --html-only,
 * then epub-gen-memory converts to EPUB and nodemailer delivers it.
 * No Calibre dependency — safe for any hosting environment.
 */
async function runNodePipeline(url: string, recipients: string[]): Promise<void> {
  // Run the Java pipeline in HTML-only mode. It prints the output path as:
  //   HTML_OUTPUT:/absolute/path/to/articles/title.html
  const htmlPath = await runJavaHtmlOnly(url);
  console.log(`  HTML ready: ${htmlPath}`);
  await generateAndSend(htmlPath, recipients);
}

/**
 * Calibre pipeline: Java runs the full pipeline (fetch, clean, Calibre EPUB,
 * send). Original behavior, kept as a fallback via EPUB_GENERATOR=calibre.
 */
async function runCalrePipeline(url: string, recipients: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      READSTACK_RECIPIENT_EMAILS: recipients.join(", "),
    };

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
        const detail = stderr.trim() || stdout.trim() || `exit code ${code}`;
        reject(new Error(detail));
      }
    });

    proc.on("error", reject);
  });
}

/**
 * Spawns the Java pipeline with --html-only. Parses the HTML_OUTPUT: line from
 * stdout to return the absolute path of the written HTML file.
 */
function runJavaHtmlOnly(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("./readstack", [url, "--html-only"], {
      cwd: REPO_ROOT,
      env: process.env,
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
      if (code !== 0) {
        const detail = stderr.trim() || stdout.trim() || `exit code ${code}`;
        return reject(new Error(detail));
      }

      // The Java pipeline prints exactly one line starting with "HTML_OUTPUT:"
      // which contains the absolute path to the cleaned HTML file.
      const marker = stdout
        .split("\n")
        .find((line) => line.startsWith("HTML_OUTPUT:"));

      if (!marker) {
        return reject(
          new Error("Java pipeline did not print an HTML_OUTPUT path. stdout: " + stdout)
        );
      }

      resolve(marker.replace("HTML_OUTPUT:", "").trim());
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
