/**
 * Node.js EPUB generation and delivery path.
 *
 * Replaces the Calibre step: reads the cleaned HTML file produced by the Java
 * pipeline, converts it to EPUB using epub-gen-memory, and sends it via Gmail
 * SMTP using nodemailer. The Java pipeline is still used for fetching, HTML
 * cleaning, and image downloading — only the Calibre call is bypassed.
 *
 * Activated when EPUB_GENERATOR=node in the environment. Falls back to the
 * Calibre path automatically (see run-job.ts) if the env var is unset.
 */

import epub from "epub-gen-memory";
import nodemailer from "nodemailer";
import { readFileSync, writeFileSync } from "fs";
import path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");
const ARTICLES_DIR = path.join(REPO_ROOT, "articles");

/**
 * Generates an EPUB from the cleaned HTML file at htmlPath and sends it to
 * all recipient addresses. The htmlPath is the absolute path printed by the
 * Java pipeline when run with --html-only.
 */
export async function generateAndSend(
  htmlPath: string,
  recipients: string[]
): Promise<void> {
  const epubBuffer = await buildEpub(htmlPath);
  await sendEpub(epubBuffer, htmlPath, recipients);
}

async function buildEpub(htmlPath: string): Promise<Buffer> {
  let html = readFileSync(htmlPath, "utf-8");

  // Extract title from the <title> tag for EPUB metadata.
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "Readstack Article";

  // Rewrite relative image src paths to absolute file:// URLs so
  // epub-gen-memory reads them from disk rather than over the network.
  // The Java pipeline writes images to articles/{baseName}/{index}.ext
  // and the HTML references them as {baseName}/{index}.ext.
  const articlesDir = path.dirname(htmlPath);
  html = html.replace(
    /(<img[^>]+src=")(?!https?:\/\/|data:|file:\/\/)([^"]+)(")/gi,
    (_match, before, src, after) => {
      const absoluteImagePath = path.join(articlesDir, src);
      return `${before}file://${absoluteImagePath}${after}`;
    }
  );

  // Strip the <base href> tag — it points at "[link]" after cleanup and
  // would confuse epub-gen-memory's image resolution.
  html = html.replace(/<base[^>]*>/gi, "");

  // The library expects inner body content, not a full HTML document.
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : html;

  const rawBuffer = await epub(
    {
      title,
      author: "Readstack",
      lang: "en",
      version: 2,                  // EPUB 2 for best Kindle compatibility
      prependChapterTitles: false,  // title is already in the body HTML
      numberChaptersInTOC: false,
      tocInTOC: false,
      ignoreFailedDownloads: true,  // missing images should not abort delivery
    },
    [
      {
        title,
        content: bodyContent,
        excludeFromToc: false,
      },
    ]
  );

  // Write the EPUB alongside the HTML for debugging and re-delivery.
  const epubPath = htmlPath.replace(/\.html$/i, ".epub");
  writeFileSync(epubPath, Buffer.from(rawBuffer));
  console.log(`  EPUB written: ${epubPath}`);

  return Buffer.from(rawBuffer);
}

async function sendEpub(
  epubBuffer: Buffer,
  htmlPath: string,
  recipients: string[]
): Promise<void> {
  const senderEmail = process.env.READSTACK_SMTP_EMAIL;
  const senderPassword = process.env.READSTACK_SMTP_PASSWORD;

  if (!senderEmail || !senderPassword) {
    throw new Error(
      "READSTACK_SMTP_EMAIL and READSTACK_SMTP_PASSWORD must be set for the Node EPUB generator path."
    );
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // STARTTLS on port 587
    family: 4,     // Force IPv4 — Railway does not support IPv6
    auth: {
      user: senderEmail,
      pass: senderPassword,
    },
  });

  // Derive the filename from the HTML path for the email attachment.
  const epubFilename = path.basename(htmlPath).replace(/\.html$/i, ".epub");

  // Send separately to each recipient — Kindle and regular inboxes can
  // behave differently and per-recipient sends make failures easier to trace.
  for (const recipient of recipients) {
    await transporter.sendMail({
      from: senderEmail,
      to: recipient,
      subject: "Readstack delivery",
      text: "Sent by Readstack.",
      attachments: [
        {
          filename: epubFilename,
          content: epubBuffer,
          contentType: "application/epub+zip",
        },
      ],
    });
    console.log(`  Delivered to: ${recipient}`);
  }
}
