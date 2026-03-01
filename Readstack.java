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