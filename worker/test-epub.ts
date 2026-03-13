/**
 * Standalone test script to validate epub-gen-memory output on Kindle.
 *
 * Takes an existing cleaned HTML file from articles/ (produced by the Java
 * pipeline), generates an EPUB using epub-gen-memory, and writes it to disk.
 * Email the output file to your Kindle address to test compatibility before
 * committing to replacing Calibre in the live pipeline.
 *
 * Usage:
 *   cd worker && npx tsx test-epub.ts
 *
 * Output: articles/test-output.epub
 */

import epub from "epub-gen-memory";
import { readFileSync, writeFileSync } from "fs";
import path from "path";

const REPO_ROOT = path.resolve(__dirname, "..");
const ARTICLES_DIR = path.join(REPO_ROOT, "articles");

// Pick one of the existing cleaned HTML files to test with.
// Change this to any file in articles/ — ideally one with images.
const TEST_HTML_FILE = "Can Art Be Funny and Effective in These Times.html";
const OUTPUT_FILE = path.join(ARTICLES_DIR, "test-output.epub");

async function main() {
  const htmlPath = path.join(ARTICLES_DIR, TEST_HTML_FILE);
  console.log(`Reading: ${htmlPath}`);

  let html = readFileSync(htmlPath, "utf-8");

  // Extract title from <title> tag for the EPUB metadata.
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "Readstack Article";
  console.log(`Title: ${title}`);

  // Rewrite relative image src paths to absolute file:// URLs so
  // epub-gen-memory can read them directly from disk.
  // Input:  src="Can Art Be Funny and Effective in These Times/0.jpg"
  // Output: src="file:///path/to/articles/Can Art.../0.jpg"
  html = html.replace(
    /(<img[^>]+src=")(?!https?:\/\/|data:|file:\/\/)([^"]+)(")/gi,
    (_match, before, src, after) => {
      const absolutePath = path.join(ARTICLES_DIR, src);
      return `${before}file://${absolutePath}${after}`;
    }
  );

  // Remove the <base href> tag — epub-gen-memory doesn't need it and it
  // can confuse some readers if left pointing at "[link]".
  html = html.replace(/<base[^>]*>/gi, "");

  // Strip the outer <html>/<head>/<body> shell — the library expects the
  // inner body content, not a full document.
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : html;

  console.log("Generating EPUB...");

  const buffer = await epub(
    {
      title,
      author: "Readstack",
      lang: "en",
      version: 2,               // EPUB 2 for best Kindle compatibility
      prependChapterTitles: false, // title is already in the HTML content
      numberChaptersInTOC: false,
      tocInTOC: false,
      ignoreFailedDownloads: true, // don't fail if an image is missing
      verbose: true,
    },
    [
      {
        title,
        content: bodyContent,
        excludeFromToc: false,
      },
    ]
  );

  writeFileSync(OUTPUT_FILE, Buffer.from(buffer));
  console.log(`\nEPUB written to: ${OUTPUT_FILE}`);
  console.log("\nNext steps:");
  console.log("  1. Email the file to your Kindle address as an attachment");
  console.log("  2. Check: does it open? Do images render? Do headings appear in Go To?");
  console.log("  3. If it looks good, we proceed with the full pipeline integration");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
