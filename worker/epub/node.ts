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
import { Resend } from "resend";
import { readFileSync, writeFileSync } from "fs";
import path from "path";


/**
 * Generates an EPUB from the cleaned HTML file at htmlPath and sends it to
 * all recipient addresses. The htmlPath is the absolute path printed by the
 * Java pipeline when run with --html-only.
 */
export async function generateAndSend(
  htmlPath: string,
  recipients: string[],
  byline: string | null = null,
  publishedTime: string | null = null
): Promise<void> {
  let result: { buffer: Buffer; title: string };
  try {
    result = await buildEpub(htmlPath, byline, publishedTime);
  } catch {
    throw new Error("CONVERT_ERROR");
  }
  await sendEpub(result.buffer, result.title, recipients);
}

async function buildEpub(htmlPath: string, byline: string | null = null, publishedTime: string | null = null): Promise<{ buffer: Buffer; title: string }> {
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

  // Unwrap images from anchor tags so tapping an image on Kindle doesn't
  // open the browser. Replace <a ...><img ...></a> with just the <img>.
  html = html.replace(/<a[^>]*>\s*(<img[^>]*>)\s*<\/a>/gi, "$1");

  // The library expects inner body content, not a full HTML document.
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : html;

  // Format the published date if available (ISO → "Month D, YYYY").
  let dateStr = "";
  if (publishedTime) {
    try {
      dateStr = new Date(publishedTime).toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric",
      });
    } catch { /* ignore malformed dates */ }
  }

  // Build a subtitle line: "By Author · Date" (either part optional).
  const subtitleParts = [byline ? `By ${byline}` : "", dateStr].filter(Boolean);
  const subtitleHtml = subtitleParts.length
    ? `<p style="font-size:0.95em;color:#555;margin:0.3em 0 1.8em;">${subtitleParts.join(" · ")}</p>`
    : "";

  // Prepend the article title and byline/date as styled HTML so they appear
  // at the very top of the chapter content.
  const chapterContent = `
    <h1 style="font-size:1.6em;margin:0 0 0.2em;">${title}</h1>
    ${subtitleHtml}
    ${bodyContent}
  `;

  const rawBuffer = await epub(
    {
      title,
      author: byline ? `By ${byline} - From Read-Stack` : "From Read-Stack",
      lang: "en",
      version: 2,                  // EPUB 2 for best Kindle compatibility
      prependChapterTitles: false,  // title is in the chapter HTML above
      numberChaptersInTOC: false,
      tocInTOC: false,
      ignoreFailedDownloads: true,  // missing images should not abort delivery
    },
    [
      {
        title,
        content: chapterContent,
        beforeToc: true,  // place chapter before the TOC page in the spine
      },
    ]
  );

  // Write the EPUB alongside the HTML for debugging and re-delivery.
  const epubPath = htmlPath.replace(/\.html$/i, ".epub");
  writeFileSync(epubPath, Buffer.from(rawBuffer));
  console.log(`  EPUB written: ${epubPath}`);

  return { buffer: Buffer.from(rawBuffer), title };
}

function sanitizeFilename(title: string): string {
  return (
    title
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 60)
      .trim() || "article"
  );
}

async function sendEpub(
  epubBuffer: Buffer,
  title: string,
  recipients: string[]
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const senderEmail = process.env.READSTACK_FROM_EMAIL;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY must be set.");
  }
  if (!senderEmail) {
    throw new Error("READSTACK_FROM_EMAIL must be set (e.g. readstack@yourdomain.com).");
  }

  const resend = new Resend(apiKey);

  const epubFilename = `${sanitizeFilename(title)}.epub`;

  // Send separately to each recipient — Kindle and regular inboxes can
  // behave differently and per-recipient sends make failures easier to trace.
  for (const recipient of recipients) {
    const { error } = await resend.emails.send({
      from: senderEmail,
      to: recipient,
      subject: "Readstack delivery",
      text: "Sent by Readstack.",
      attachments: [
        {
          filename: epubFilename,
          content: epubBuffer,
        },
      ],
    });
    if (error) {
      console.error(`  Resend error for ${recipient}: ${error.message}`);
      throw new Error("SMTP_ERROR");
    }
    console.log(`  Delivered to: ${recipient}`);
  }
}
