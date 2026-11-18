package kr.it.reserve.chat.service;

import java.util.Locale;
import java.util.Map;

/** 원래 이름은 다운로드용 메타데이터이며 S3 객체 경로나 로그에는 사용하지 않는다. */
public final class ChatAttachmentFilename {
    private static final Map<String, String> EXTENSIONS = Map.of(
            "image/jpeg", "jpg", "image/png", "png", "image/webp", "webp", "image/gif", "gif",
            "application/pdf", "pdf", "text/plain", "txt");
    private static final int MAX_FILENAME_BYTES = 255;

    private ChatAttachmentFilename() { }

    public static String sanitize(String originalFilename, String contentType) {
        String extension = EXTENSIONS.get(contentType);
        if (extension == null) throw new IllegalArgumentException("Unsupported chat attachment content type");
        if (originalFilename == null || originalFilename.isBlank()) return null;
        String name = originalFilename.substring(1 + Math.max(originalFilename.lastIndexOf('/'), originalFilename.lastIndexOf('\\')))
                .replaceAll("[\\p{Cc}\\p{Cs}\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]", "")
                .replaceAll("[<>:\"|?*]", "_").strip();
        name = trimTrailingDotsAndSpaces(name);
        int dot = name.lastIndexOf('.');
        String suffix = "." + extension;
        if (dot >= 0) {
            String declaredExtension = name.substring(dot + 1).toLowerCase(Locale.ROOT);
            if (extension.equals(declaredExtension) || "image/jpeg".equals(contentType) && "jpeg".equals(declaredExtension)) {
                suffix = name.substring(dot);
            }
            name = name.substring(0, dot);
        }
        name = name.replaceAll("^\\.+", "").strip();
        if (name.isBlank()) return null;
        if (name.matches("(?i)(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\\..*)?")) name = "_" + name;
        return truncateUtf8(name, MAX_FILENAME_BYTES - suffix.length()) + suffix;
    }

    public static String forDownload(String originalFilename, String contentType) {
        String name = sanitize(originalFilename, contentType);
        if (name != null) return name;
        return (contentType.startsWith("image/") ? "chat-image." : "chat-file.") + EXTENSIONS.get(contentType);
    }

    private static String trimTrailingDotsAndSpaces(String value) {
        int end = value.length();
        while (end > 0 && (value.charAt(end - 1) == '.' || value.charAt(end - 1) == ' ')) end--;
        return value.substring(0, end);
    }

    private static String truncateUtf8(String value, int maxBytes) {
        int offset = 0;
        int bytes = 0;
        while (offset < value.length()) {
            int codePoint = value.codePointAt(offset);
            int size = codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
            if (bytes + size > maxBytes) break;
            bytes += size;
            offset += Character.charCount(codePoint);
        }
        return value.substring(0, offset);
    }
}
