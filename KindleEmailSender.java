import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Properties;
import java.util.concurrent.TimeUnit;

import jakarta.mail.Authenticator;
import jakarta.mail.Message;
import jakarta.mail.MessagingException;
import jakarta.mail.PasswordAuthentication;
import jakarta.mail.Session;
import jakarta.mail.Transport;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeBodyPart;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;

/**
 * Sends a generated ebook as an email attachment to configured recipient addresses.
 * Uses Jakarta Mail with Gmail SMTP so MIME formatting is standards-compliant.
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
            throws MessagingException, IOException {
        Properties props = new Properties();
        props.put("mail.smtp.host", SMTP_HOST);
        props.put("mail.smtp.port", Integer.toString(SMTP_PORT));
        props.put("mail.smtp.auth", "true");
        props.put("mail.smtp.ssl.enable", "true");
        props.put("mail.smtp.ssl.protocols", "TLSv1.2 TLSv1.3");

        Session session = Session.getInstance(props, new Authenticator() {
            @Override
            protected PasswordAuthentication getPasswordAuthentication() {
                return new PasswordAuthentication(senderEmail, senderPassword);
            }
        });

        MimeMessage message = new MimeMessage(session);
        message.setFrom(new InternetAddress(senderEmail));
        message.setRecipients(Message.RecipientType.TO, InternetAddress.parse(recipientEmail, false));
        message.setSubject("Readstack delivery", StandardCharsets.UTF_8.name());

        MimeBodyPart textPart = new MimeBodyPart();
        textPart.setText("Sent by Readstack.", StandardCharsets.UTF_8.name());

        MimeBodyPart attachmentPart = new MimeBodyPart();
        attachmentPart.attachFile(ebookPath.toFile());
        attachmentPart.setHeader("Content-Type", "application/epub+zip; name=\"" + ebookPath.getFileName() + "\"");
        attachmentPart.setFileName(ebookPath.getFileName().toString());

        MimeMultipart multipart = new MimeMultipart();
        multipart.addBodyPart(textPart);
        multipart.addBodyPart(attachmentPart);

        message.setContent(multipart);
        message.saveChanges();
        Transport.send(message);
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
