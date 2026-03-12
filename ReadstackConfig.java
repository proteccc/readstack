import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Loads local Readstack configuration from the process environment and optional .env file.
 * Environment variables take precedence over .env values.
 *
 * This is intentionally tiny and permissive. It is not trying to be a full dotenv
 * parser; it only supports the simple KEY=value shape used by this project.
 */
public class ReadstackConfig {
    // Load the optional .env file once at startup so repeated config lookups stay cheap.
    private static final Map<String, String> DOT_ENV = loadDotEnv();

    public static String get(String key) {
        // Process environment wins because it is the least surprising override layer.
        String envValue = System.getenv(key);
        if (!isBlank(envValue)) {
            return envValue;
        }
        return DOT_ENV.getOrDefault(key, "");
    }

    private static Map<String, String> loadDotEnv() {
        Map<String, String> values = new HashMap<>();
        Path envPath = Path.of(".env");
        // Missing .env is normal on fresh clones or CI-like environments.
        if (!Files.isRegularFile(envPath)) {
            return values;
        }

        try {
            List<String> lines = Files.readAllLines(envPath);
            for (String rawLine : lines) {
                String line = rawLine.trim();
                // Ignore comments and blank lines so the file can stay readable.
                if (line.isEmpty() || line.startsWith("#")) {
                    continue;
                }
                int equalsIndex = line.indexOf('=');
                // Invalid lines are ignored rather than treated as fatal because this
                // file is developer-managed local config, not authoritative input.
                if (equalsIndex <= 0) {
                    continue;
                }

                String key = line.substring(0, equalsIndex).trim();
                String value = stripQuotes(line.substring(equalsIndex + 1).trim());
                // Empty values are skipped to preserve the "env/.env fallback" behavior.
                if (!key.isEmpty() && !value.isEmpty()) {
                    values.put(key, value);
                }
            }
        } catch (IOException e) {
            System.out.println("Warning: could not read .env: " + e.getMessage());
        }
        return values;
    }

    private static String stripQuotes(String value) {
        // Simple quote stripping lets users write either KEY=value or KEY="value"
        // without forcing them into one exact dotenv style.
        if (value.length() >= 2) {
            char first = value.charAt(0);
            char last = value.charAt(value.length() - 1);
            if ((first == '"' && last == '"') || (first == '\'' && last == '\'')) {
                return value.substring(1, value.length() - 1);
            }
        }
        return value;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
