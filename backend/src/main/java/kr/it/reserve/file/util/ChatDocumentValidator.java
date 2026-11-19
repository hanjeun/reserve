package kr.it.reserve.file.util;

import kr.it.reserve.global.error.FileException;
import org.springframework.http.HttpStatus;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

public final class ChatDocumentValidator {
    public static final int MAX_BYTES = 7 * 1024 * 1024;
    private static final String PDF = "application/pdf";
    private static final String TEXT = "text/plain";

    private ChatDocumentValidator() {}

    public static boolean supports(String contentType) {
        return PDF.equals(contentType) || TEXT.equals(contentType);
    }

    public static Document inspect(MultipartFile file) {
        String filename = file.getOriginalFilename();
        String lowerName = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        String type;
        if (lowerName.endsWith(".pdf")) type = PDF;
        else if (lowerName.endsWith(".txt")) type = TEXT;
        else throw FileException.invalid("PDF 또는 TXT 파일을 첨부해주세요.");

        if (file.getSize() > MAX_BYTES) throw tooLarge();
        try (var input = file.getInputStream()) {
            byte[] bytes = input.readNBytes(MAX_BYTES + 1);
            if (bytes.length > MAX_BYTES) throw tooLarge();
            if (bytes.length == 0) throw FileException.invalid("비어 있는 파일은 첨부할 수 없어요.");
            if (PDF.equals(type)) {
                String header = new String(bytes, 0, Math.min(bytes.length, 8), StandardCharsets.US_ASCII);
                if (!header.matches("%PDF-(?:1\\.[0-7]|2\\.0)")) {
                    throw FileException.invalid("PDF 형식을 확인할 수 없어요.");
                }
            } else {
                verifyText(bytes);
            }
            return new Document(bytes, type);
        } catch (IOException exception) {
            throw FileException.invalid("첨부 파일을 읽지 못했어요.");
        }
    }

    private static void verifyText(byte[] bytes) {
        try {
            var text = StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes));
            while (text.hasRemaining()) {
                char code = text.get();
                if (Character.isISOControl(code) && code != '\t' && code != '\n' && code != '\r') {
                    throw FileException.invalid("UTF-8 텍스트 파일을 첨부해주세요.");
                }
            }
        } catch (CharacterCodingException exception) {
            throw FileException.invalid("UTF-8 텍스트 파일을 첨부해주세요.");
        }
    }

    private static FileException tooLarge() {
        return new FileException("문서는 7MB 이하로 첨부해주세요.", HttpStatus.PAYLOAD_TOO_LARGE);
    }

    public record Document(byte[] bytes, String contentType) {}
}
