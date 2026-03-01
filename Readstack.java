import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class Readstack {

    public static void main(String[] args) throws Exception {

        if (args.length != 1) {
            System.out.println("Usage: java Readstack <substack-url>");
            return;
        }

        String url = args[0];

        String html = downloadHtml(url);
        // If we got a redirect page body (e.g. open.substack.com -> publication.substack.com), follow it
        String redirectUrl = extractRedirectUrl(html);
        if (redirectUrl != null) {
            html = downloadHtml(redirectUrl);
        }

        String title = extractTitle(html);
        String baseName = sanitizeFilename(title);
        if (baseName.isEmpty()) {
            baseName = slugFromUrl(redirectUrl != null ? redirectUrl : url);
        }
        if (baseName.isEmpty()) {
            baseName = "article";
        }

        Path articlesDir = Path.of("articles");
        Files.createDirectories(articlesDir);

        Path htmlPath = articlesDir.resolve(baseName + ".html");
        Path mobiPath = articlesDir.resolve(baseName + ".mobi");

        String effectiveUrl = redirectUrl != null ? redirectUrl : url;
        String body = extractArticleBody(html);
        html = buildMinimalHtml(title.isEmpty() ? "Article" : title, body, getBaseUrl(effectiveUrl));
        Path articleImagesDir = articlesDir.resolve(baseName);
        Files.createDirectories(articleImagesDir);
        html = prepareHtmlForEbook(html, effectiveUrl, articlesDir, baseName);

        Files.writeString(htmlPath, html);
        convertToMobi(htmlPath.toString(), mobiPath.toString());

        System.out.println("Conversion complete: " + mobiPath);
    }

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

    /** If the response is a redirect page ("Found. Redirecting to ..."), return the target URL; else null. */
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

    /** Extract a slug from a Substack article URL (e.g. /p/slug or /pub/author/p/slug) for fallback filename. */
    private static String slugFromUrl(String url) {
        if (url == null) {
            return "";
        }
        // .../p/slug or .../p/slug?query
        Matcher m = Pattern.compile("/p/([^/?]+)").matcher(url);
        return m.find() ? m.group(1).trim() : "";
    }

    /** Extracts the main article content from a full Substack page so we don't convert nav, scripts, URLs. */
    private static String extractArticleBody(String html) {
        if (html == null) {
            return "";
        }
        // Try <article>...</article> first (Substack and many sites use it)
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
        // Try div with common content class names (Substack uses various)
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

    /** Wraps article body in minimal HTML so the ebook contains only content, not full page chrome. */
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

    private static String escapeHtml(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    /** Simplify tweet embeds to: profile photo, @handle, tweet text (once), date/views. Removes duplicate text and cruft. */
    private static String simplifyTweetEmbeds(String html) {
        // 1. Standard blockquote.twitter-tweet: <blockquote class="twitter-tweet"> <p>text</p> — Name (@handle) <a>date</a> </blockquote>
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

        // 2. Substack-style embed: div with embed + duplicate text. Keep first img, first @handle, first substantial text block; remove duplicate paragraphs.
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

    /** Prepares fetched HTML for ebook conversion: base URL for images, local image files, strip URL/code cruft. */
    private static String prepareHtmlForEbook(String html, String articleUrl, Path articlesDir, String baseName) {
        if (html == null || html.isEmpty()) {
            return html;
        }
        String baseUrl = getBaseUrl(articleUrl);
        if (!baseUrl.isEmpty()) {
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
        html = stripImageCruft(html);
        html = stripVisibleUrlsAndLinks(html);
        html = stripFigureCaptionsWithUrls(html);
        html = makeMathReadable(html);
        html = simplifyTweetEmbeds(html);
        html = aggressiveClean(html);
        return html;
    }

    /** Nuclear option: nuke every remaining URL, normalize img to src-only, strip scripts/styles, remove attributes that can show URLs. */
    private static String aggressiveClean(String html) {
        // 1. Normalize every <img> to only src and alt="" (no data-*, srcset, class, etc.)
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

        // 2. Remove script and style blocks entirely
        html = Pattern.compile("<script[^>]*>.*?</script>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL).matcher(html).replaceAll("");
        html = Pattern.compile("<style[^>]*>.*?</style>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL).matcher(html).replaceAll("");

        // 3. Nuke EVERY remaining http(s) URL in the entire document (images are already local)
        html = Pattern.compile("https?://[^\\s\"'<>]+").matcher(html).replaceAll("[link]");

        // 4. Replace domain-like strings in visible text (thing.tld or sub.thing.tld) so they don't show
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

        // 5. Strip all attributes from common container/inline tags (removes any href, title, data-*, class with cruft)
        String[] tagNames = { "div", "p", "span", "section", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "strong", "em" };
        for (String tag : tagNames) {
            html = Pattern.compile("<" + tag + "\\s+[^>]+>", Pattern.CASE_INSENSITIVE).matcher(html).replaceAll("<" + tag + ">");
        }

        // 6. Remove any leftover empty tags and collapse whitespace
        html = html.replaceAll("<figure>\\s*</figure>", "");
        html = html.replaceAll("\\s+", " ");
        html = html.replaceAll(">\\s+<", "><");
        return html;
    }

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

    private static String resolveImgSrc(String html, String baseUrl) {
        // Where img has data-src (lazy loading), use it as src so the converter can fetch the image
        html = Pattern.compile("(<img[^>]*)\\s+data-src=([\"'])([^\"']+)\\2([^>]*)\\ssrc=([\"'])([^\"']+)\\6([^>]*>)", Pattern.CASE_INSENSITIVE)
                .matcher(html)
                .replaceAll("$1 src=$2$3$2$4$8");
        html = Pattern.compile("(<img[^>]*)\\ssrc=([\"'])([^\"']+)\\2([^>]*)\\s+data-src=([\"'])([^\"']+)\\6([^>]*>)", Pattern.CASE_INSENSITIVE)
                .matcher(html)
                .replaceAll("$1 src=$5$6$5$4$7");
        // Replace src="relative" with src="absolute"
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

    /** Download each image to a local file and set img src to the relative path (no data URLs = no massive code blocks). */
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

    /** Remove data-* and other attributes from img that can show as code/URLs in readers. */
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

    /** Remove figure captions that contain URLs or long strings (source links, etc.). */
    private static String stripFigureCaptionsWithUrls(String html) {
        // Remove all <figcaption>...</figcaption> so no image source URLs or captions show
        html = Pattern.compile("<figcaption[^>]*>.*?</figcaption>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL).matcher(html).replaceAll("");
        return html;
    }

    /** Remove <a href="..."> wrappers around images so link URLs don't show in the ebook. */
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

    /** Remove link wrappers and replace visible URL text so HTML/AWS domains don't show in the ebook. */
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

    /** Converts LaTeX-style math in HTML to readable form for MOBI (Unicode symbols + visible code). */
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

    private static String extractTitle(String html) {
        // Prefer <title>...</title>
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

    private static String findEbookConvert() {
        // Prefer ebook-convert in PATH
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

    private static void convertToMobi(String htmlFile, String mobiFile) throws IOException, InterruptedException {
        System.out.println("Converting to MOBI...");

        String ebookConvert = findEbookConvert();
        ProcessBuilder pb = new ProcessBuilder(
                ebookConvert,
                htmlFile,
                mobiFile
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
}