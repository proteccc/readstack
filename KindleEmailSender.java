import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * Sends a generated ebook as an email attachment to configured recipient addresses.
 * Uses Gmail SMTP over implicit TLS so the repo can stay dependency-free.
 */
public class KindleEmailSender {
    private static final String SMTP_HOST = "smtp.gmail.com";
    private static final int SMTP_PORT = 465;

    public static boolean isConfigured() {
        return validateConfiguration(false);
    }

    public static boolean printPreflightCheck() {
        return validateConfiguration(true);
    }

    public static void sendToKindle(Path ebookPath) {
        if (!validateConfiguration(true)) {
            return;
        }

        String senderEmail = ReadstackConfig.get("READSTACK_SMTP_EMAIL");
        String senderPassword = getSmtpPassword();
        List<String> recipientEmails = getRecipientEmails();
        if (ebookPath == null || !Files.isRegularFile(ebookPath)) {
            System.out.println("Kindle delivery skipped: ebook file not found.");
            return;
        }

        System.out.println("Sending EPUB to recipients...");

        try {
            for (String recipientEmail : recipientEmails) {
                sendMessage(senderEmail, senderPassword, recipientEmail, ebookPath);
            }
            System.out.println("EPUB delivery complete.");
        } catch (Exception e) {
            System.out.println("EPUB delivery failed: " + e.getMessage());
        }
    }

    private static void sendMessage(String senderEmail, String senderPassword, String recipientEmail, Path ebookPath)
            throws IOException {
        SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
        try (SSLSocket socket = (SSLSocket) factory.createSocket(SMTP_HOST, SMTP_PORT)) {
            socket.startHandshake();
            try (
                    BufferedReader reader = new BufferedReader(
                            new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                    BufferedWriter writer = new BufferedWriter(
                            new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8))
            ) {
                expectOk(reader, List.of(220));
                sendLine(writer, "EHLO localhost");
                expectOk(reader, List.of(250));
                sendLine(writer, "AUTH LOGIN");
                expectOk(reader, List.of(334));
                sendLine(writer, base64(senderEmail));
                expectOk(reader, List.of(334));
                sendLine(writer, base64(senderPassword));
                expectOk(reader, List.of(235));
                sendLine(writer, "MAIL FROM:<" + senderEmail + ">");
                expectOk(reader, List.of(250));
                sendLine(writer, "RCPT TO:<" + recipientEmail + ">");
                expectOk(reader, List.of(250, 251));
                sendLine(writer, "DATA");
                expectOk(reader, List.of(354));
                writeMessage(writer, senderEmail, recipientEmail, ebookPath);
                expectOk(reader, List.of(250));
                sendLine(writer, "QUIT");
                expectOk(reader, List.of(221));
            }
        }
    }

    private static void writeMessage(BufferedWriter writer, String senderEmail, String recipientEmail, Path ebookPath)
            throws IOException {
        String boundary = "readstack-" + UUID.randomUUID();
        byte[] attachmentBytes = Files.readAllBytes(ebookPath);
        String fileName = ebookPath.getFileName().toString();

        writeRaw(writer, "From: " + senderEmail + "\r\n");
        writeRaw(writer, "To: " + recipientEmail + "\r\n");
        writeRaw(writer, "Subject: Readstack delivery\r\n");
        writeRaw(writer, "MIME-Version: 1.0\r\n");
        writeRaw(writer, "Content-Type: multipart/mixed; boundary=\"" + boundary + "\"\r\n");
        writeRaw(writer, "\r\n");
        writeRaw(writer, "--" + boundary + "\r\n");
        writeRaw(writer, "Content-Type: text/plain; charset=UTF-8\r\n");
        writeRaw(writer, "Content-Transfer-Encoding: 7bit\r\n");
        writeRaw(writer, "\r\n");
        writeRaw(writer, "Sent by Readstack.\r\n");
        writeRaw(writer, "\r\n");
        writeRaw(writer, "--" + boundary + "\r\n");
        writeRaw(writer, "Content-Type: application/epub+zip; name=\"" + fileName + "\"\r\n");
        writeRaw(writer, "Content-Transfer-Encoding: base64\r\n");
        writeRaw(writer, "Content-Disposition: attachment; filename=\"" + fileName + "\"\r\n");
        writeRaw(writer, "\r\n");
        writeBase64Attachment(writer, attachmentBytes);
        writeRaw(writer, "\r\n");
        writeRaw(writer, "--" + boundary + "--\r\n");
        writeRaw(writer, ".\r\n");
        writer.flush();
    }

    private static void writeBase64Attachment(BufferedWriter writer, byte[] bytes) throws IOException {
        String encoded = Base64.getMimeEncoder(76, "\r\n".getBytes(StandardCharsets.UTF_8)).encodeToString(bytes);
        writeRaw(writer, encoded);
        writeRaw(writer, "\r\n");
    }

    private static void expectOk(BufferedReader reader, List<Integer> expectedCodes) throws IOException {
        String line = reader.readLine();
        if (line == null || line.length() < 3) {
            throw new IOException("SMTP server closed connection unexpectedly.");
        }

        int statusCode = parseStatusCode(line);
        while (line.length() > 3 && line.charAt(3) == '-') {
            line = reader.readLine();
            if (line == null || line.length() < 3) {
                throw new IOException("SMTP server closed connection unexpectedly.");
            }
            statusCode = parseStatusCode(line);
        }

        if (!expectedCodes.contains(statusCode)) {
            throw new IOException(line);
        }
    }

    private static int parseStatusCode(String line) throws IOException {
        try {
            return Integer.parseInt(line.substring(0, 3));
        } catch (NumberFormatException e) {
            throw new IOException("Unexpected SMTP response: " + line, e);
        }
    }

    private static void sendLine(BufferedWriter writer, String line) throws IOException {
        writeRaw(writer, line);
        writeRaw(writer, "\r\n");
        writer.flush();
    }

    private static void writeRaw(BufferedWriter writer, String value) throws IOException {
        writer.write(value);
    }

    private static String base64(String value) {
        return Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static boolean validateConfiguration(boolean verbose) {
        String senderEmail = ReadstackConfig.get("READSTACK_SMTP_EMAIL");
        String senderPassword = getSmtpPassword();
        List<String> recipientEmails = getRecipientEmails();
        String keychainService = getKeychainService();

        boolean valid = true;
        if (isBlank(senderEmail)) {
            valid = false;
            if (verbose) {
                System.out.println("Missing env var: READSTACK_SMTP_EMAIL");
            }
        }
        if (isBlank(senderPassword)) {
            valid = false;
            if (verbose) {
                System.out.println("Missing SMTP password: set READSTACK_SMTP_PASSWORD or store it in macOS Keychain.");
            }
        }
        if (recipientEmails.isEmpty()) {
            valid = false;
            if (verbose) {
                System.out.println("Missing recipient configuration: set READSTACK_RECIPIENT_EMAILS or READSTACK_KINDLE_EMAIL.");
            }
        }

        if (!valid && verbose) {
            System.out.println("EPUB delivery not configured, skipping.");
            System.out.println("Recommended local setup:");
            System.out.println("  1. Edit .env if you need to change the sender or recipients.");
            System.out.println("  2. Store the Gmail app password in Keychain:");
            if (!isBlank(senderEmail)) {
                System.out.println("     security add-generic-password -a \"" + senderEmail + "\" -s \"" + keychainService + "\" -w");
            } else {
                System.out.println("     security add-generic-password -a \"your-gmail@gmail.com\" -s \"" + keychainService + "\" -w");
            }
            System.out.println("  3. If your runtime cannot read macOS Keychain, set READSTACK_SMTP_PASSWORD in local .env as a fallback.");
            System.out.println("  4. Run: ./readstack <substack-url> --send");
        }
        return valid;
    }

    private static String getSmtpPassword() {
        String configuredPassword = ReadstackConfig.get("READSTACK_SMTP_PASSWORD");
        if (!isBlank(configuredPassword)) {
            return configuredPassword;
        }
        return lookupPasswordInKeychain(ReadstackConfig.get("READSTACK_SMTP_EMAIL"));
    }

    private static List<String> getRecipientEmails() {
        String configuredRecipients = ReadstackConfig.get("READSTACK_RECIPIENT_EMAILS");
        if (!isBlank(configuredRecipients)) {
            List<String> recipients = new ArrayList<>();
            for (String recipient : configuredRecipients.split(",")) {
                String trimmed = recipient.trim();
                if (!isBlank(trimmed) && !recipients.contains(trimmed)) {
                    recipients.add(trimmed);
                }
            }
            if (!recipients.isEmpty()) {
                return recipients;
            }
        }

        String legacyRecipient = ReadstackConfig.get("READSTACK_KINDLE_EMAIL");
        if (!isBlank(legacyRecipient)) {
            return Arrays.asList(legacyRecipient.trim());
        }
        return List.of();
    }

    private static String lookupPasswordInKeychain(String senderEmail) {
        if (isBlank(senderEmail) || !isMac()) {
            return "";
        }

        ProcessBuilder pb = new ProcessBuilder(
                "security",
                "find-generic-password",
                "-a",
                senderEmail,
                "-s",
                getKeychainService(),
                "-w"
        );

        try {
            Process process = pb.start();
            boolean finished = process.waitFor(5, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                return "";
            }
            if (process.exitValue() != 0) {
                return "";
            }
            String password = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
            return password;
        } catch (Exception e) {
            return "";
        }
    }

    private static String getKeychainService() {
        String service = ReadstackConfig.get("READSTACK_SMTP_KEYCHAIN_SERVICE");
        return isBlank(service) ? "readstack-smtp" : service;
    }

    private static boolean isMac() {
        return System.getProperty("os.name").toLowerCase().contains("mac");
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
