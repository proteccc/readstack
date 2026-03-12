import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Loads local Readstack configuration from the process environment and optional .env file.
 * Environment variables take precedence over .env values.
 */
public class ReadstackConfig {
    private static final Map<String, String> DOT_ENV = loadDotEnv();

    public static String get(String key) {
        String envValue = System.getenv(key);
        if (!isBlank(envValue)) {
            return envValue;
        }
        return DOT_ENV.getOrDefault(key, "");
    }

    private static Map<String, String> loadDotEnv() {
        Map<String, String> values = new HashMap<>();
        Path envPath = Path.of(".env");
        if (!Files.isRegularFile(envPath)) {
            return values;
        }

        try {
            List<String> lines = Files.readAllLines(envPath);
            for (String rawLine : lines) {
                String line = rawLine.trim();
                if (line.isEmpty() || line.startsWith("#")) {
                    continue;
                }
                int equalsIndex = line.indexOf('=');
                if (equalsIndex <= 0) {
                    continue;
                }

                String key = line.substring(0, equalsIndex).trim();
                String value = stripQuotes(line.substring(equalsIndex + 1).trim());
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
