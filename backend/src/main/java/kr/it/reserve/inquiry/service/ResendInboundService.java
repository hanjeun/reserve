package kr.it.reserve.inquiry.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import kr.it.reserve.file.util.ImageFileValidator.ValidatedImage;
import kr.it.reserve.global.error.InquiryException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.inquiry.entity.Inquiry;
import kr.it.reserve.inquiry.repository.InquiryRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import javax.swing.text.MutableAttributeSet;
import javax.swing.text.html.HTML;
import javax.swing.text.html.HTMLEditorKit;
import javax.swing.text.html.parser.ParserDelegator;
import java.io.IOException;
import java.io.StringReader;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
@ConditionalOnProperty(name = "mail.resend-inbound.enabled", havingValue = "true")
public class ResendInboundService {
    private static final Pattern EMAIL_ID = Pattern.compile(
            "[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}");
    private static final Pattern THREAD_ID = Pattern.compile("<[^<>\\s\\p{Cntrl}@]+@[^<>\\s\\p{Cntrl}@]+>");
    private static final Pattern CONTROL = Pattern.compile("[\\p{Cc}\\p{Zl}\\p{Zp}]+");
    private static final int MAX_BODY_CHARACTERS = 10_000;
    private final InquiryRepository inquiries;
    private final ResendReceivedMailClient client;
    private final InquiryService inquiryService;
    private final ObjectMapper mapper;
    private final RateLimiter limiter;
    private final String recipient;
    private final String sendingAddress;

    public ResendInboundService(InquiryRepository inquiries, ResendReceivedMailClient client, InquiryService inquiryService,
            ObjectMapper mapper, RateLimiter limiter,
            @Value("${mail.resend-inbound.recipient}") String recipient,
            @Value("${mail.from:}") String sendingAddress) {
        this.inquiries = inquiries;
        this.client = client;
        this.inquiryService = inquiryService;
        this.mapper = mapper;
        this.limiter = limiter;
        InternetAddress support = mailbox(recipient);
        if (support == null || !support.getAddress().equalsIgnoreCase(recipient)) {
            throw new IllegalStateException("A single Resend inbound support address is required");
        }
        this.recipient = support.getAddress();
        this.sendingAddress = sendingAddress;
    }

    public void receive(byte[] payload) {
        JsonNode event = readEvent(payload);
        if (!"email.received".equals(event.path("type").asText())) return;

        JsonNode data = event.path("data");
        String rawId = data.path("email_id").asText();
        if (!EMAIL_ID.matcher(rawId).matches()) throw invalidEvent();
        if (!addressedToSupport(data)) return;

        InternetAddress sender = mailbox(data.path("from").asText());
        if (sender == null || sender.getAddress().equalsIgnoreCase(sendingAddress)
                || sender.getAddress().equalsIgnoreCase(recipient)) return;

        UUID id = UUID.fromString(rawId);
        String emailId = id.toString();
        if (inquiries.existsByResendEmailId(emailId)) return;
        if (!limiter.tryConsume("resend", RateLimiter.Policy.RESEND_MAIL_RETRIEVE)) {
            throw new InquiryException("수신 메일을 잠시 후 다시 가져와요.", HttpStatus.SERVICE_UNAVAILABLE);
        }
        // 본문 API 호출을 마친 뒤 저장하며, 응답은 DB 커밋 결과에 맞춘다.
        JsonNode mail = client.retrieve(id).orElse(null);
        if (mail != null && isAutomaticMail(mail.path("headers"))) return;
        List<ValidatedImage> photos = mail == null || mail.path("attachments").isEmpty()
                ? List.of() : client.retrievePhotos(id, mail.path("attachments"));

        String subject = oneLine(data.path("subject").asText());
        String displayName = oneLine(sender.getPersonal());
        Inquiry inquiry = Inquiry.builder()
                .resendEmailId(emailId)
                .inboundMessageId(threadId(data.path("message_id").asText()))
                .guestEmail(sender.getAddress())
                .guestName(displayName.isEmpty() ? null : clip(displayName, 50))
                .title(subject.isEmpty() ? "(제목 없음)" : clip(subject, 200))
                .category(Inquiry.InquiryCategory.ETC)
                .content(bodyText(mail))
                .build();
        try {
            inquiryService.saveInbound(inquiry, photos);
        } catch (DataIntegrityViolationException conflict) {
            if (!inquiries.existsByResendEmailId(emailId)) throw conflict;
        }
    }

    private JsonNode readEvent(byte[] payload) {
        try {
            JsonNode event = mapper.readTree(payload);
            if (event != null && event.isObject() && event.path("type").isTextual()) return event;
        } catch (IOException invalid) {
            throw invalidEvent();
        }
        throw invalidEvent();
    }

    private static InquiryException invalidEvent() {
        return new InquiryException("수신 메일 이벤트를 확인할 수 없어요.", HttpStatus.BAD_REQUEST);
    }

    private boolean addressedToSupport(JsonNode data) {
        JsonNode envelope = data.path("received_for");
        if (envelope.isArray() && !envelope.isEmpty()) return containsRecipient(envelope);
        return containsRecipient(data.path("to")) || containsRecipient(data.path("cc")) || containsRecipient(data.path("bcc"));
    }

    private boolean containsRecipient(JsonNode addresses) {
        if (!addresses.isArray()) return false;
        for (JsonNode value : addresses) {
            InternetAddress address = mailbox(value.asText());
            if (address != null && address.getAddress().equalsIgnoreCase(recipient)) return true;
        }
        return false;
    }

    private static InternetAddress mailbox(String value) {
        if (value == null || value.isBlank() || value.length() > 512
                || value.codePoints().anyMatch(Character::isISOControl)) return null;
        try {
            InternetAddress[] addresses = InternetAddress.parse(value, true);
            if (addresses.length != 1 || addresses[0].isGroup()) return null;
            InternetAddress address = addresses[0];
            address.validate();
            return address.getAddress().length() <= 254 ? address : null;
        } catch (AddressException invalid) {
            return null;
        }
    }

    private static String threadId(String value) {
        return value.length() <= 255 && THREAD_ID.matcher(value).matches() ? value : null;
    }

    private static boolean isAutomaticMail(JsonNode headers) {
        for (var header : headers.properties()) {
            if ("auto-submitted".equalsIgnoreCase(header.getKey())) {
                String value = header.getValue().asText();
                return !value.isBlank() && !"no".equalsIgnoreCase(value.strip());
            }
        }
        return false;
    }

    private static String oneLine(String value) {
        return value == null ? "" : CONTROL.matcher(value).replaceAll(" ").strip();
    }

    private static String bodyText(JsonNode mail) {
        if (mail == null) return "메일이 커서 본문을 표시할 수 없어요. Resend에서 원문을 확인해주세요.";
        String text = mail.path("text").asText("").replace("\0", "").strip();
        if (text.isEmpty()) text = plainHtml(mail.path("html").asText(""));
        return text.isEmpty() ? "(본문 없음)" : clip(text, MAX_BODY_CHARACTERS);
    }

    // 외부 이미지나 마크업을 받은 문의에 표시하지 않도록 텍스트만 추출한다.
    private static String plainHtml(String html) {
        if (html.isBlank()) return "";
        StringBuilder text = new StringBuilder();
        try {
            new ParserDelegator().parse(new StringReader(html), new HTMLEditorKit.ParserCallback() {
                private boolean inBody;

                @Override
                public void handleStartTag(HTML.Tag tag, MutableAttributeSet attributes, int position) {
                    if (tag == HTML.Tag.BODY) inBody = true;
                }

                @Override
                public void handleText(char[] data, int position) {
                    if (inBody) text.append(data);
                }

                @Override
                public void handleSimpleTag(HTML.Tag tag, MutableAttributeSet attributes, int position) {
                    if (inBody && tag == HTML.Tag.BR) text.append('\n');
                }

                @Override
                public void handleEndTag(HTML.Tag tag, int position) {
                    if (inBody && tag.isBlock()) text.append('\n');
                    if (tag == HTML.Tag.BODY) inBody = false;
                }
            }, true);
        } catch (IOException unreadable) {
            return "본문을 읽을 수 없어요. Resend에서 원문을 확인해주세요.";
        }
        return text.toString().replace("\0", "").strip();
    }

    private static String clip(String value, int limit) {
        if (value.codePointCount(0, value.length()) <= limit) return value;
        return value.substring(0, value.offsetByCodePoints(0, limit - 1)) + "…";
    }
}
