/**
 * Node.js article fetching and extraction.
 *
 * Replaces the Java HTML-extraction pipeline. Uses @mozilla/readability
 * (the same library behind Firefox Reader Mode) to extract clean article
 * content from any URL, then writes it to disk in the same format that
 * worker/epub/node.ts expects.
 *
 * This removes the JDK dependency from the production worker entirely.
 */

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const REPO_ROOT = path.resolve(__dirname, "..");
const ARTICLES_DIR = path.join(REPO_ROOT, "articles");

/**
 * Fetches the article at `url`, extracts the main content via Readability,
 * writes a clean HTML file to disk, and returns its absolute path.
 */
export async function fetchArticle(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      // Identify ourselves clearly; some sites block generic fetch user-agents.
      "User-Agent":
        "Mozilla/5.0 (compatible; Readstack/1.0; +https://readstack.app)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch article (${response.status}): ${url}`);
  }

  const html = await response.text();

  // jsdom + Readability mirrors what Firefox Reader Mode does.
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) {
    throw new Error(
      `Readability could not extract article content from: ${url}`
    );
  }

  const title = article.title?.trim() || "Readstack Article";

  // Write a self-contained HTML file. Images keep their original src URLs so
  // epub-gen-memory can download them directly (it already handles failures).
  const cleanedHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
</head>
<body>
  ${article.content}
</body>
</html>`;

  // Derive a stable directory name from the URL slug (last 60 chars of the
  // sanitised URL). Matches the naming convention the Java pipeline used.
  const slug = url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(-60);

  const articleDir = path.join(ARTICLES_DIR, slug);
  mkdirSync(articleDir, { recursive: true });

  const htmlPath = path.join(articleDir, "article.html");
  writeFileSync(htmlPath, cleanedHtml, "utf-8");

  console.log(`  Article extracted: "${title}"`);
  console.log(`  HTML written: ${htmlPath}`);

  return htmlPath;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
