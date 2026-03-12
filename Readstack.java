import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.FileSystem;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Readstack: CLI tool that fetches a Substack article URL, extracts the content,
 * downloads images locally, cleans HTML/URLs, and converts to EPUB for delivery.
 */
public class Readstack {

    /**
     * Entry point. Expects one argument: a Substack article URL.
     * Fetches the page, extracts article body, prepares HTML for ebook conversion,
     * saves to articles/ folder, and converts to EPUB via Calibre's ebook-convert.
     */
    public static void main(String[] args) throws Exception {
        boolean sendToKindle = false;
        String url = null;
        for (String arg : args) {
            if ("--send".equals(arg)) {
                sendToKindle = true;
            } else if ("--nosend".equals(arg)) {
                sendToKindle = false;
            } else if (arg.startsWith("--")) {
                System.out.println("Unknown option: " + arg);
                System.out.println("Usage: java Readstack <substack-url> [--send|--nosend]");
                return;
            } else if (url == null) {
                url = arg;
            } else {
                System.out.println("Usage: java Readstack <substack-url> [--send|--nosend]");
                return;
            }
        }

        // Validate URL argument
        if (url == null) {
            System.out.println("Usage: java Readstack <substack-url> [--send|--nosend]");
            return;
        }
        if (!isValidHttpUrl(url)) {
            System.out.println("Invalid URL: " + url);
            System.out.println("Usage: java Readstack <substack-url> [--send|--nosend]");
            return;
        }
        if (sendToKindle && !KindleEmailSender.printPreflightCheck()) {
            return;
        }

        // Fetch the page; open.substack.com often returns a redirect body, so follow it
        String html = downloadHtml(url);
        String redirectUrl = extractRedirectUrl(html);
        if (redirectUrl != null) {
            html = downloadHtml(redirectUrl);
        }

        // Derive output filename from article title, or URL slug, or "article"
        String title = extractTitle(html);
        String baseName = sanitizeFilename(title);
        if (baseName.isEmpty()) {
            baseName = slugFromUrl(redirectUrl != null ? redirectUrl : url);
        }
        if (baseName.isEmpty()) {
            baseName = "article";
        }

        // Create articles/ directory and paths for HTML and EPUB output
        Path articlesDir = Path.of("articles");
        Files.createDirectories(articlesDir);
        Path htmlPath = articlesDir.resolve(baseName + ".html");
        Path epubPath = articlesDir.resolve(baseName + ".epub");

        // Extract article body, wrap in minimal HTML, then run full ebook prep pipeline
        String effectiveUrl = redirectUrl != null ? redirectUrl : url;
        String body = extractArticleBody(html);
        html = buildMinimalHtml(title.isEmpty() ? "Article" : title, body, getBaseUrl(effectiveUrl));
        Path articleImagesDir = articlesDir.resolve(baseName);
        Files.createDirectories(articleImagesDir);
        html = prepareHtmlForEbook(html, effectiveUrl, articlesDir, baseName);

        // Write prepared HTML and convert to EPUB via Calibre
        Files.writeString(htmlPath, html);
        convertToEpub(htmlPath.toString(), epubPath.toString());
        sanitizeEpubForKindle(epubPath);

        System.out.println("Conversion complete: " + epubPath);
        if (sendToKindle) {
            KindleEmailSender.sendToKindle(epubPath);
        } else {
            System.out.println("Kindle delivery skipped.");
        }
    }

    /**
     * Fetches the raw HTML of the given URL via HTTP GET.
     * Uses HttpClient with redirect following enabled.
     */
    private static String downloadHtml(String url) throws Exception {
        System.out.println("Downloading article...");

        HttpClient client = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .GET()
                .build();

        HttpResponse<String> response =
                client.send(request, HttpResponse.BodyHandlers.ofString());

        return response.body();
    }

    private static boolean isValidHttpUrl(String url) {
        try {
            URI uri = URI.create(url);
            String scheme = uri.getScheme();
            return ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))
                    && uri.getHost() != null
                    && !uri.getHost().isBlank();
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    /**
     * If the response body is a redirect page (e.g. "Found. Redirecting to https://..."),
     * parses and returns the target URL. Otherwise returns null.
     */
    private static String extractRedirectUrl(String body) {
        if (body == null || body.length() < 50) {
            return null;
        }
        String trimmed = body.trim();
        // "Found. Redirecting to https://..."
        if (trimmed.startsWith("Found.") || trimmed.startsWith("Redirecting")) {
            Matcher m = Pattern.compile("(https://[^\\s]+)").matcher(trimmed);
            if (m.find()) {
                return m.group(1).trim().replaceFirst("\\.$", "");
            }
        }
        Matcher m = Pattern.compile("Redirecting to\\s+(https://[^\\s]+)", Pattern.CASE_INSENSITIVE).matcher(trimmed);
        if (m.find()) {
            return m.group(1).trim().replaceFirst("\\.$", "");
        }
        return null;
    }

    /**
     * Extracts the article slug from a Substack URL (e.g. /p/slug or /pub/author/p/slug).
     * Used as fallback filename when the page title cannot be extracted.
     */
    private static String slugFromUrl(String url) {
        if (url == null) {
            return "";
        }
        // .../p/slug or .../p/slug?query
        Matcher m = Pattern.compile("/p/([^/?]+)").matcher(url);
        return m.find() ? m.group(1).trim() : "";
    }

    /**
     * Extracts the main article content from a full Substack page.
     * Tries &lt;article&gt;, then divs with content classes, then &lt;body&gt;.
     * Returns only the article body so we don't convert nav, scripts, or page chrome.
     */
    private static String extractArticleBody(String html) {
        if (html == null) {
            return "";
        }
        // Try <article>...</article> first; use depth counting to handle nested articles
        int articleStart = html.indexOf("<article");
        if (articleStart >= 0) {
            int contentStart = html.indexOf(">", articleStart) + 1;
            int depth = 1;
            int i = contentStart;
            while (i < html.length() && depth > 0) {
                int nextOpen = html.indexOf("<article", i);
                int nextClose = html.indexOf("</article>", i);
                if (nextClose < 0) break;
                if (nextOpen >= 0 && nextOpen < nextClose) {
                    depth++;
                    i = nextOpen + 8;
                } else {
                    depth--;
                    if (depth == 0) {
                        return html.substring(contentStart, nextClose).trim();
                    }
                    i = nextClose + 10;
                }
            }
        }
        // Try div with common content class names; Substack uses various conventions
        String[] contentClassPatterns = {
            "available-content", "post-content", "body-markup", "markup", "entry-content", "article-body"
        };
        for (String pattern : contentClassPatterns) {
            Pattern p = Pattern.compile("<div[^>]*class=[^>]*" + Pattern.quote(pattern) + "[^>]*>", Pattern.CASE_INSENSITIVE);
            Matcher m = p.matcher(html);
            if (m.find()) {
                int start = m.end();
                int depth = 1;
                int i = start;
                while (i < html.length() && depth > 0) {
                    int nextDivOpen = html.indexOf("<div", i);
                    int nextDivClose = html.indexOf("</div>", i);
                    if (nextDivClose < 0) break;
                    if (nextDivOpen >= 0 && nextDivOpen < nextDivClose) {
                        depth++;
                        i = nextDivOpen + 4;
                    } else {
                        depth--;
                        if (depth == 0) {
                            String extracted = html.substring(start, nextDivClose).trim();
                            if (extracted.length() > 100) {
                                return extracted;
                            }
                        }
                        i = nextDivClose + 6;
                    }
                }
            }
        }
        // Fallback: strip obvious non-content and return a portion that likely has the post
        // Look for a block that has lots of <p> tags (article body)
        int bodyStart = html.indexOf("<body");
        if (bodyStart >= 0) {
            int bodyContentStart = html.indexOf(">", bodyStart) + 1;
            int bodyEnd = html.indexOf("</body>", bodyContentStart);
            if (bodyEnd > bodyContentStart) {
                return html.substring(bodyContentStart, bodyEnd).trim();
            }
        }
        return html;
    }

    /**
     * Wraps the extracted article body in minimal HTML: doctype, head (charset, base, styles),
     * body with h1 title and content. Styles include list alignment, heading spacing, and tweet-embed.
     */
    private static String buildMinimalHtml(String title, String body, String baseUrl) {
        StringBuilder sb = new StringBuilder();
        sb.append("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n");
        sb.append("<meta charset=\"UTF-8\">\n");
        if (!baseUrl.isEmpty()) {
            sb.append("<base href=\"").append(baseUrl).append("\">\n");
        }
        sb.append("<title>").append(escapeHtml(title)).append("</title>\n");
        sb.append("<style>");
        sb.append("body{font-family:serif;max-width:40em;margin:0;padding:0.5em 1em;line-height:1.5;}");
        sb.append("h1{font-size:1.35em;margin:0 0 0.5em;line-height:1.2;}");
        sb.append("h2{font-size:1.2em;margin:0.75em 0 0.35em;}");
        sb.append("h3,h4,h5,h6{font-size:1.1em;margin:0.6em 0 0.25em;}");
        sb.append("p{margin:0.4em 0;}");
        sb.append("ul,ol{margin:0.4em 0 0.4em 1.25em;padding-left:0.5em;}");
        sb.append("li{margin:0.15em 0;}");
        sb.append("img{max-width:100%;height:auto;}");
        sb.append(".math,.math-display{font-style:italic;}");
        sb.append(".tweet-embed{display:block;margin:0.75em 0;padding:0.5em;border-left:3px solid #ccc;}");
        sb.append(".tweet-embed img.tweet-avatar{width:40px;height:40px;border-radius:50%;vertical-align:middle;margin-right:0.5em;}");
        sb.append(".tweet-meta{font-size:0.9em;color:#555;}");
        sb.append(".tweet-date{font-size:0.85em;color:#888;}");
        sb.append("</style>\n");
        sb.append("</head>\n<body>\n");
        sb.append("<h1>").append(escapeHtml(title)).append("</h1>\n");
        sb.append(body);
        sb.append("\n</body>\n</html>");
        return sb.toString();
    }

    /** Escapes HTML special characters so text is safe inside attributes or content. */
    private static String escapeHtml(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    /**
     * Simplifies tweet embeds to: profile photo, @handle, tweet text (once), date/views.
     * Handles blockquote.twitter-tweet and Substack-style embed divs; removes duplicate text.
     */
    private static String simplifyTweetEmbeds(String html) {
        // 1. Standard Twitter embed: blockquote with class twitter-tweet
        Pattern block = Pattern.compile("<blockquote[^>]*class=[^>]*twitter-tweet[^>]*>(.*?)</blockquote>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
        Matcher m = block.matcher(html);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String inner = m.group(1);
            String img = "";
            Matcher imgM = Pattern.compile("<img[^>]*src=([\"'])([^\"']+)\\1[^>]*>", Pattern.CASE_INSENSITIVE).matcher(inner);
            if (imgM.find()) {
                img = "<img class=\"tweet-avatar\" src=\"" + imgM.group(2).replace("\"", "&quot;") + "\" alt=\"\">";
            }
            String handle = "";
            Matcher handleM = Pattern.compile("\\(@([a-zA-Z0-9_]+)\\)").matcher(inner);
            if (handleM.find()) {
                handle = "<span class=\"tweet-meta\">@" + handleM.group(1) + "</span>";
            }
            String text = "";
            Matcher pM = Pattern.compile("<p[^>]*>([^<]+)</p>").matcher(inner);
            if (pM.find()) {
                text = "<p class=\"tweet-text\">" + pM.group(1).trim() + "</p>";
            }
            String date = "";
            Matcher aM = Pattern.compile("—[^<]*<a[^>]*>([^<]+)</a>").matcher(inner);
            if (aM.find()) {
                date = "<span class=\"tweet-date\">" + aM.group(1).trim() + "</span>";
            }
            String replacement = "<div class=\"tweet-embed\">" + img + " " + handle + " " + text + " " + date + "</div>";
            m.appendReplacement(sb, Matcher.quoteReplacement(replacement));
        }
        m.appendTail(sb);
        html = sb.toString();

        // 2. Substack-style embed divs: keep first img, @handle, first substantial text; drop duplicates
        Pattern embedDiv = Pattern.compile("<div[^>]*class=[^>]*embed[^>]*>.*?</div>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
        m = embedDiv.matcher(html);
        sb = new StringBuffer();
        while (m.find()) {
            String blockHtml = m.group(0);
            String img = "";
            Matcher imgM2 = Pattern.compile("<img[^>]*src=([\"'])([^\"']+)\\1[^>]*>", Pattern.CASE_INSENSITIVE).matcher(blockHtml);
            if (imgM2.find()) {
                img = "<img class=\"tweet-avatar\" src=\"" + imgM2.group(2).replace("\"", "&quot;") + "\" alt=\"\">";
            }
            String handle2 = "";
            Matcher handleM2 = Pattern.compile("@([a-zA-Z0-9_]+)").matcher(blockHtml);
            if (handleM2.find()) {
                handle2 = "<span class=\"tweet-meta\">@" + handleM2.group(1) + "</span>";
            }
            Matcher pM2 = Pattern.compile("<p[^>]*>([^<]{10,})</p>").matcher(blockHtml);
            String firstText = "";
            if (pM2.find()) {
                firstText = "<p class=\"tweet-text\">" + pM2.group(1).trim() + "</p>";
            }
            Matcher spanText = Pattern.compile("<span[^>]*class=[^>]*text[^>]*>([^<]+)</span>", Pattern.CASE_INSENSITIVE).matcher(blockHtml);
            if (firstText.isEmpty() && spanText.find()) {
                firstText = "<p class=\"tweet-text\">" + spanText.group(1).trim() + "</p>";
            }
            String date2 = "";
            Matcher timeM = Pattern.compile("<time[^>]*>([^<]+)</time>").matcher(blockHtml);
            if (timeM.find()) {
                date2 = "<span class=\"tweet-date\">" + timeM.group(1).trim() + "</span>";
            }
            if (!img.isEmpty() || !handle2.isEmpty() || !firstText.isEmpty()) {
                String replacement2 = "<div class=\"tweet-embed\">" + img + " " + handle2 + " " + firstText + " " + date2 + "</div>";
                m.appendReplacement(sb, Matcher.quoteReplacement(replacement2));
            } else {
                m.appendReplacement(sb, Matcher.quoteReplacement(blockHtml));
            }
        }
        m.appendTail(sb);
        return sb.toString();
    }

    /**
     * Full pipeline to prepare HTML for ebook conversion: inject base URL, resolve image URLs,
     * download images locally, strip links/captions/URLs, simplify tweets, and run aggressive cleanup.
     */
    private static String prepareHtmlForEbook(String html, String articleUrl, Path articlesDir, String baseName) {
        if (html == null || html.isEmpty()) {
            return html;
        }
        String baseUrl = getBaseUrl(articleUrl);
        if (!baseUrl.isEmpty()) {
            // Inject <base href="..."> so relative image URLs resolve
            if (!html.contains("<base ") && !html.contains("<base>")) {
                html = Pattern.compile("(<head[^>]*>)", Pattern.CASE_INSENSITIVE)
                        .matcher(html)
                        .replaceFirst("$1<base href=\"" + baseUrl + "\">");
            }
            html = resolveImgSrc(html, baseUrl);
        }
        html = stripImageLinks(html);
        Path articleImagesDir = articlesDir.resolve(baseName);
        html = downloadImagesToLocal(html, articleImagesDir, baseName);
        // Strip cruft, URLs, links, figcaptions; simplify math and tweets; then aggressive clean
        html = stripImageCruft(html);
        html = stripUiChrome(html);
        html = stripVisibleUrlsAndLinks(html);
        html = stripFigureCaptionsWithUrls(html);
        html = makeMathReadable(html);
        html = simplifyTweetEmbeds(html);
        html = aggressiveClean(html);
        return html;
    }

    /**
     * Aggressive final cleanup: normalize img to src-only, remove script/style blocks,
     * replace all remaining URLs with [link], strip domain names from text, remove attributes from tags.
     */
    private static String aggressiveClean(String html) {
        html = flattenPictureTags(html);

        // 1. Normalize every <img> to only src and alt=""; drop data URLs
        Matcher imgMatcher = Pattern.compile("<img[^>]*\\ssrc=([\"'])([^\"']+)\\1[^>]*>", Pattern.CASE_INSENSITIVE).matcher(html);
        StringBuffer sb = new StringBuffer();
        while (imgMatcher.find()) {
            String src = imgMatcher.group(2);
            if (src.startsWith("data:")) {
                imgMatcher.appendReplacement(sb, "");
                continue;
            }
            src = src.replace("\"", "&quot;");
            imgMatcher.appendReplacement(sb, Matcher.quoteReplacement("<img src=\"" + src + "\" alt=\"\">"));
        }
        imgMatcher.appendTail(sb);
        html = sb.toString();

        // 2. Remove script and style blocks (no JS/CSS or embedded URLs)
        html = Pattern.compile("<script[^>]*>.*?</script>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL).matcher(html).replaceAll("");
        html = Pattern.compile("<style[^>]*>.*?</style>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL).matcher(html).replaceAll("");
        html = stripSvgBlocks(html);
        html = Pattern.compile("<button[^>]*>.*?</button>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL).matcher(html).replaceAll("");
        html = Pattern.compile("<source[^>]*>", Pattern.CASE_INSENSITIVE).matcher(html).replaceAll("");
        html = Pattern.compile("\\s+data-[a-z0-9-]+=([\"']).*?\\1", Pattern.CASE_INSENSITIVE | Pattern.DOTALL).matcher(html).replaceAll("");
        html = Pattern.compile("\\s+[a-z0-9:-]+=([\"'])javascript:[^\"']*\\1", Pattern.CASE_INSENSITIVE).matcher(html).replaceAll("");

        // 3. Replace every remaining http(s) URL with [link] (images are already local)
        html = Pattern.compile("https?://[^\\s\"'<>]+").matcher(html).replaceAll("[link]");

        // 4. In visible text, remove domain-like strings (e.g. substack.com, amazonaws.com)
        Pattern textPat = Pattern.compile(">([^<]*)<");
        Matcher textMat = textPat.matcher(html);
        StringBuffer sb2 = new StringBuffer();
        while (textMat.find()) {
            String seg = textMat.group(1);
            seg = seg.replaceAll("(?i)[a-z0-9][-a-z0-9]*(\\.[a-z0-9][-a-z0-9]*)+\\.(com|net|org|io)(/[^\\s]*)?", "");
            seg = seg.replaceAll("(\\[link\\]\\s*)+", "[link] ");
            seg = seg.replaceAll("(?i)href\\s*=\\s*[\"']?[^\"'\\s<>]*", "");
            seg = seg.replaceAll("(?i)src\\s*=\\s*[\"']?[^\"'\\s<>]*", "");
            textMat.appendReplacement(sb2, ">" + Matcher.quoteReplacement(seg) + "<");
        }
        textMat.appendTail(sb2);
        html = sb2.toString();

        // 5. Strip all attributes from container/inline tags (removes href, title, data-*, etc.)
        String[] tagNames = { "div", "p", "span", "section", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "strong", "em" };
        for (String tag : tagNames) {
            html = Pattern.compile("<" + tag + "\\s+[^>]+>", Pattern.CASE_INSENSITIVE).matcher(html).replaceAll("<" + tag + ">");
        }

        // 6. Remove empty figures and collapse whitespace
        html = html.replaceAll("<figure>\\s*</figure>", "");
        html = html.replaceAll("\\s+", " ");
        html = html.replaceAll(">\\s+<", "><");
        return html;
    }

    /**
     * Removes obvious Substack UI chrome that should not appear in the ebook.
     */
    private static String stripUiChrome(String html) {
        html = Pattern.compile("<button[^>]*>.*?</button>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL).matcher(html).replaceAll("");
        html = Pattern.compile("<source[^>]*>", Pattern.CASE_INSENSITIVE).matcher(html).replaceAll("");
        html = stripSvgBlocks(html);
        return html;
    }

    /**
     * Replaces picture wrappers with their img content so responsive image sources do not leak into output.
     */
    private static String flattenPictureTags(String html) {
        Pattern picturePattern = Pattern.compile("<picture[^>]*>(.*?)</picture>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
        Matcher matcher = picturePattern.matcher(html);
        StringBuffer sb = new StringBuffer();
        while (matcher.find()) {
            String pictureHtml = matcher.group(1);
            Matcher imgMatcher = Pattern.compile("<img[^>]*>", Pattern.CASE_INSENSITIVE).matcher(pictureHtml);
            String replacement = imgMatcher.find() ? imgMatcher.group(0) : "";
            matcher.appendReplacement(sb, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    /**
     * Removes inline SVG blocks, including nested SVG content commonly used for UI icons.
     */
    private static String stripSvgBlocks(String html) {
        String previous;
        String current = html;
        do {
            previous = current;
            current = Pattern.compile("<svg[^>]*>.*?</svg>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL)
                    .matcher(previous)
                    .replaceAll("");
        } while (!current.equals(previous));
        return current;
    }

    /**
     * Parses a URL and returns the base (scheme + host + port if non-default).
     * Used for resolving relative image URLs.
     */
    private static String getBaseUrl(String url) {
        try {
            URI u = URI.create(url);
            String scheme = u.getScheme();
            String host = u.getHost();
            if (scheme == null || host == null) {
                return "";
            }
            int port = u.getPort();
            if (port <= 0) {
                port = "https".equalsIgnoreCase(scheme) ? 443 : 80;
            }
            boolean defaultPort = (port == 443 && "https".equalsIgnoreCase(scheme)) || (port == 80 && "http".equalsIgnoreCase(scheme));
            String base = scheme + "://" + host + (defaultPort ? "" : ":" + port) + "/";
            return base;
        } catch (Exception e) {
            return "";
        }
    }

    /**
     * Resolves image src to absolute URLs: prefers data-src over src for lazy-loaded images,
     * then converts relative and protocol-relative URLs to absolute using baseUrl.
     */
    private static String resolveImgSrc(String html, String baseUrl) {
        // For lazy-loaded images, use data-src as the real URL
        html = Pattern.compile("(<img[^>]*)\\s+data-src=([\"'])([^\"']+)\\2([^>]*)\\ssrc=([\"'])([^\"']+)\\6([^>]*>)", Pattern.CASE_INSENSITIVE)
                .matcher(html)
                .replaceAll("$1 src=$2$3$2$4$8");
        html = Pattern.compile("(<img[^>]*)\\ssrc=([\"'])([^\"']+)\\2([^>]*)\\s+data-src=([\"'])([^\"']+)\\6([^>]*>)", Pattern.CASE_INSENSITIVE)
                .matcher(html)
                .replaceAll("$1 src=$5$6$5$4$7");
        // Convert relative and protocol-relative URLs to absolute
        Matcher m = Pattern.compile("(<img[^>]*\\s+src=)([\"'])([^\"']+)(\\2)", Pattern.CASE_INSENSITIVE).matcher(html);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String src = m.group(3);
            String resolved = toAbsoluteUrl(src, baseUrl);
            m.appendReplacement(sb, Matcher.quoteReplacement(m.group(1) + m.group(2) + resolved + m.group(4)));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    /**
     * Converts a relative or protocol-relative URL to absolute.
     * Already-absolute URLs are returned unchanged.
     */
    private static String toAbsoluteUrl(String url, String baseUrl) {
        if (url == null || url.isEmpty()) {
            return url;
        }
        String u = url.trim();
        if (u.startsWith("http://") || u.startsWith("https://")) {
            return u;
        }
        if (u.startsWith("//")) {
            return "https:" + u;
        }
        if (u.startsWith("/")) {
            return baseUrl.replaceFirst("/$", "") + u;
        }
        return baseUrl + u;
    }

    /**
     * Downloads each image from its URL to a local file (e.g. 0.png, 1.jpg) in articleImagesDir.
     * Updates img src to the relative path (baseName/0.png) so no data URLs or external URLs remain.
     */
    private static String downloadImagesToLocal(String html, Path articleImagesDir, String baseName) {
        HttpClient client = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
        Pattern p = Pattern.compile("(<img[^>]*\\s+src=)([\"'])([^\"']+)(\\2)", Pattern.CASE_INSENSITIVE);
        Matcher m = p.matcher(html);
        StringBuffer sb = new StringBuffer();
        int index = 0;
        while (m.find()) {
            String src = m.group(3).trim();
            if (src.startsWith("data:")) {
                m.appendReplacement(sb, Matcher.quoteReplacement(m.group(0)));
                continue;
            }
            byte[] bytes = fetchImageBytes(client, src);
            // Infer extension from URL; save to articleImagesDir; update src to relative path
            String replacement = null;
            if (bytes != null) {
                try {
                    String ext = "png";
                    String contentType = null;
                    if (src.contains(".jpg") || src.contains(".jpeg")) {
                        ext = "jpg";
                    } else if (src.contains(".gif")) {
                        ext = "gif";
                    } else if (src.contains(".webp")) {
                        ext = "webp";
                    }
                    Path imagePath = articleImagesDir.resolve(index + "." + ext);
                    Files.write(imagePath, bytes);
                    String relativeSrc = baseName + "/" + index + "." + ext;
                    replacement = m.group(1) + m.group(2) + relativeSrc + m.group(4);
                    index++;
                } catch (IOException e) {
                    // keep original src
                }
            }
            m.appendReplacement(sb, replacement != null ? Matcher.quoteReplacement(replacement) : Matcher.quoteReplacement(m.group(0)));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    /**
     * Fetches image bytes from the given URL. Returns null on failure.
     * Uses browser-like User-Agent so CDNs don't block the request.
     */
    private static byte[] fetchImageBytes(HttpClient client, String imageUrl) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(imageUrl))
                    .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
                    .header("Accept", "image/*,*/*")
                    .GET()
                    .build();
            HttpResponse<byte[]> response = client.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() != 200 || response.body() == null || response.body().length == 0) {
                return null;
            }
            return response.body();
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Removes data-* and srcset attributes from img tags.
     * These can contain long URLs or base64 that show as cruft in some readers.
     */
    private static String stripImageCruft(String html) {
        Matcher m = Pattern.compile("<img([^>]*)>", Pattern.CASE_INSENSITIVE).matcher(html);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String attrs = m.group(1)
                    .replaceAll("\\s+data-[a-z0-9-]+=[\"'][^\"']*[\"']", "")
                    .replaceAll("\\s+srcset=[\"'][^\"']*[\"']", "");
            m.appendReplacement(sb, "<img" + attrs + ">");
        }
        m.appendTail(sb);
        return sb.toString();
    }

    /**
     * Removes all &lt;figcaption&gt; elements. Captions often contain image source URLs.
     */
    private static String stripFigureCaptionsWithUrls(String html) {
        // Remove all <figcaption>...</figcaption> so no image source URLs or captions show
        html = Pattern.compile("<figcaption[^>]*>.*?</figcaption>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL).matcher(html).replaceAll("");
        return html;
    }

    /**
     * Removes &lt;a&gt; wrappers around images; keeps only the &lt;img&gt;.
     * Also clears alt attributes that are URLs.
     */
    private static String stripImageLinks(String html) {
        // Replace <a ...><img ...></a> with just <img ...> (match non-greedy so we get one img per link)
        html = Pattern.compile("<a[^>]+href=[\"'][^\"']*[\"'][^>]*>\\s*(<img[^>]*>)\\s*</a>", Pattern.CASE_INSENSITIVE)
                .matcher(html)
                .replaceAll("$1");
        // Remove alt text that is a URL so it doesn't show when image is missing or in some readers
        html = Pattern.compile("(<img[^>]*\\s)alt=[\"'](https?://[^\"']+)[\"']", Pattern.CASE_INSENSITIVE)
                .matcher(html)
                .replaceAll("$1alt=\"\"");
        return html;
    }

    /**
     * Removes all &lt;a&gt; tags (keeps inner content), strips title attributes that are URLs,
     * and replaces visible http(s) URLs in text with [link].
     */
    private static String stripVisibleUrlsAndLinks(String html) {
        // Remove title attributes that are URLs (can show as tooltip/caption)
        html = Pattern.compile("\\stitle=[\"']https?://[^\"']*[\"']", Pattern.CASE_INSENSITIVE).matcher(html).replaceAll("");
        // Unwrap all <a href="...">...</a> to just the inner content (removes the link; URL may still be in text)
        html = Pattern.compile("<a[^>]+href=[\"'][^\"']*[\"'][^>]*>", Pattern.CASE_INSENSITIVE).matcher(html).replaceAll("");
        html = Pattern.compile("</a>", Pattern.CASE_INSENSITIVE).matcher(html).replaceAll("");
        // In visible text (between > and <), replace any http(s) URL with [link] so domains don't show
        Pattern textPattern = Pattern.compile(">([^<]*)<");
        Matcher m = textPattern.matcher(html);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String segment = m.group(1);
            String cleaned = segment.replaceAll("https?://[^\\s<>\"']+", "[link]");
            m.appendReplacement(sb, ">" + Matcher.quoteReplacement(cleaned) + "<");
        }
        m.appendTail(sb);
        html = sb.toString();
        // Collapse multiple "[link]" and trim stray spaces
        html = html.replaceAll("(\\[link\\]\\s*)+", "[link] ");
        return html;
    }

    /**
     * Converts LaTeX-style math to readable form: replaces common commands with Unicode
     * (e.g. \\alpha → α), and wraps unhandled \( ... \) and $$ ... $$ in spans so they display.
     */
    private static String makeMathReadable(String html) {
        // Replace common LaTeX commands with Unicode equivalents so they render in e-readers
        String[] replacements = {
            "\\alpha", "α", "\\beta", "β", "\\gamma", "γ", "\\delta", "δ", "\\epsilon", "ε",
            "\\theta", "θ", "\\lambda", "λ", "\\mu", "μ", "\\pi", "π", "\\sigma", "σ",
            "\\omega", "ω", "\\infty", "∞", "\\times", "×", "\\div", "÷", "\\pm", "±",
            "\\leq", "≤", "\\geq", "≥", "\\neq", "≠", "\\approx", "≈", "\\equiv", "≡",
            "\\rightarrow", "→", "\\leftarrow", "←", "\\Rightarrow", "⇒", "\\Leftarrow", "⇐",
            "\\sum", "∑", "\\prod", "∏", "\\int", "∫", "\\sqrt", "√", "\\cdot", "·",
            "\\ldots", "…", "\\cdots", "⋯", "\\quad", " ", "\\qquad", "  ",
            "\\frac12", "½", "\\frac14", "¼", "\\frac34", "¾", "\\frac13", "⅓", "\\frac23", "⅔"
        };
        for (int i = 0; i < replacements.length; i += 2) {
            html = html.replace(replacements[i], replacements[i + 1]);
        }
        // Wrap \( ... \) and \[ ... \] and $$ ... $$ in spans so LaTeX is visible if not replaced
        html = Pattern.compile("\\\\\\((.+?)\\\\\\)", Pattern.DOTALL).matcher(html).replaceAll("<span class=\"math\">$1</span>");
        html = Pattern.compile("\\\\\\[(.+?)\\\\\\]", Pattern.DOTALL).matcher(html).replaceAll("<span class=\"math-display\">$1</span>");
        html = Pattern.compile("\\$\\$([^$]+)\\$\\$").matcher(html).replaceAll("<span class=\"math-display\">$1</span>");
        html = Pattern.compile("\\$([^$]+)\\$").matcher(html).replaceAll("<span class=\"math\">$1</span>");
        return html;
    }

    /**
     * Extracts the article title from HTML: tries &lt;title&gt; first, then og:title meta.
     */
    private static String extractTitle(String html) {
        Matcher titleMatcher = Pattern.compile("<title[^>]*>([^<]+)</title>", Pattern.CASE_INSENSITIVE).matcher(html);
        if (titleMatcher.find()) {
            return titleMatcher.group(1).trim();
        }
        // Fallback: og:title meta
        Matcher ogMatcher = Pattern.compile("<meta[^>]+property=[\"']og:title[\"'][^>]+content=[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE).matcher(html);
        if (ogMatcher.find()) {
            return ogMatcher.group(1).trim();
        }
        return "";
    }

    /**
     * Converts a title string to a safe filename: replaces invalid chars, collapses spaces,
     * trims hyphens, and limits length to 150 chars.
     */
    private static String sanitizeFilename(String title) {
        if (title == null || title.isEmpty()) {
            return "";
        }
        // Remove/replace characters invalid in filenames: \ / : * ? " < > |
        String sanitized = title
                .replaceAll("[\\\\/:*?\"<>|]", "-")
                .replaceAll("\\s+", " ")
                .trim();
        // Collapse multiple hyphens and trim hyphens from ends
        sanitized = sanitized.replaceAll("-+", "-").replaceAll("^-|-$", "");
        // Limit length for filesystem sanity
        int maxLen = 150;
        if (sanitized.length() > maxLen) {
            sanitized = sanitized.substring(0, maxLen).replaceAll("-?$", "");
        }
        return sanitized;
    }

    /**
     * Locates the ebook-convert executable: checks PATH first, then macOS Calibre app paths.
     */
    private static String findEbookConvert() {
        String pathEnv = System.getenv("PATH");
        if (pathEnv != null) {
            for (String dir : pathEnv.split(File.pathSeparator)) {
                Path exe = Path.of(dir, "ebook-convert");
                if (Files.isExecutable(exe)) {
                    return exe.toString();
                }
            }
        }
        // On macOS, Calibre is often installed as an app and not in PATH
        if (System.getProperty("os.name").toLowerCase().contains("mac")) {
            String[] macPaths = {
                "/Applications/calibre.app/Contents/MacOS/ebook-convert",
                "/Applications/Calibre.app/Contents/MacOS/ebook-convert"
            };
            for (String p : macPaths) {
                if (Files.isExecutable(Path.of(p))) {
                    return p;
                }
            }
        }
        return "ebook-convert"; // fallback; will fail with a clear error if missing
    }

    /**
     * Invokes Calibre's ebook-convert to convert HTML to EPUB.
     * Inherits stdin/stdout/stderr so the user sees conversion progress.
     */
    private static void convertToEpub(String htmlFile, String epubFile) throws IOException, InterruptedException {
        System.out.println("Converting to EPUB...");

        String ebookConvert = findEbookConvert();
        ProcessBuilder pb = new ProcessBuilder(
                ebookConvert,
                htmlFile,
                epubFile
        );
        pb.inheritIO();

        try {
            Process process = pb.start();
            int exitCode = process.waitFor();

            if (exitCode != 0) {
                throw new RuntimeException("Conversion failed with exit code " + exitCode + ".");
            }
        } catch (IOException e) {
            if (e.getMessage() != null && e.getMessage().contains("Cannot run program")) {
                throw new IOException(
                    "Could not run ebook-convert. Install Calibre (https://calibre-ebook.com) and ensure it is on your PATH, or on macOS it will be used from /Applications/calibre.app.",
                    e
                );
            }
            throw e;
        }
    }

    /**
     * Rewrites Calibre's SVG-based cover page to a plain img tag for better Kindle compatibility.
     */
    private static void sanitizeEpubForKindle(Path epubPath) throws IOException {
        System.out.println("Sanitizing EPUB for Kindle...");

        URI epubUri = URI.create("jar:" + epubPath.toUri());
        try (FileSystem zipFs = FileSystems.newFileSystem(epubUri, java.util.Map.of())) {
            Path titlePage = zipFs.getPath("/titlepage.xhtml");
            if (!Files.exists(titlePage)) {
                return;
            }

            String titlePageHtml = Files.readString(titlePage);
            String sanitizedHtml = titlePageHtml.replaceAll(
                    "(?s)<svg[^>]*>\\s*<image[^>]*xlink:href=\"([^\"]+)\"[^>]*/>\\s*</svg>",
                    "<img src=\"$1\" alt=\"Cover\" style=\"max-width: 100%; height: auto;\"/>"
            );
            if (!sanitizedHtml.equals(titlePageHtml)) {
                Files.writeString(titlePage, sanitizedHtml);
            }
        }
    }
}
