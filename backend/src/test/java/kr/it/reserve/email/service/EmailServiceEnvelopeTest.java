package kr.it.reserve.email.service;

import jakarta.mail.Message;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.internet.ContentType;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Properties;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class EmailServiceEnvelopeTest {

    private static final String FROM_EMAIL = "noreply@example.test";
    private static final String FROM_NAME = "예약팀 한글 café 🌿";
    private static final String MEMBER_EMAIL = "member@example.test";
    private static final String OWNER_EMAIL = "owner@example.test";
    private static final String ADMIN_EMAIL = "admin@example.test";
    private static final String MEMBER_NAME = "고객 한글 café 🌿 <b>홍길동</b>";
    private static final String MEMBER_HTML = "고객 한글 caf&eacute; 🌿 &lt;b&gt;홍길동&lt;/b&gt;";
    private static final String STORE_NAME = "서울 <script>alert(1)</script> & 스튜디오";
    private static final String STORE_HTML = "서울 &lt;script&gt;alert(1)&lt;/script&gt; &amp; 스튜디오";
    private static final String REASON = "영업시간 변경 🕒\r\n<script>alert(1)</script> & 재신청";
    private static final String REASON_HTML = "영업시간 변경 🕒<br>&lt;script&gt;alert(1)&lt;/script&gt; &amp; 재신청";

    @ParameterizedTest(name = "{0}")
    @MethodSource("mailCases")
    @DisplayName("공개 메일 경로는 UTF-8 MIME와 수신자·HTML 계약을 유지한다")
    void publicMailPathsPreserveEnvelopeAndHtmlAfterMimeRoundTrip(MailCase mail) throws Exception {
        MimeMessage message = deliver(mail.send());

        assertThat(message.getSubject()).isEqualTo(mail.subject());
        assertThat(message.getFrom()).hasSize(1);
        InternetAddress from = (InternetAddress) message.getFrom()[0];
        assertThat(from.getAddress()).isEqualTo(FROM_EMAIL);
        assertThat(from.getPersonal()).isEqualTo(FROM_NAME);
        assertThat(message.getAllRecipients()).hasSize(1);
        assertThat(message.getRecipients(Message.RecipientType.TO)).hasSize(1);
        assertThat(((InternetAddress) message.getRecipients(Message.RecipientType.TO)[0]).getAddress())
                .isEqualTo(mail.recipient());
        assertThat(message.getHeader("Cc")).isNull();
        assertThat(message.getHeader("Bcc")).isNull();
        if (mail.replyTo() == null) {
            assertThat(message.getHeader("Reply-To")).isNull();
        } else {
            assertThat(message.getReplyTo()).hasSize(1);
            assertThat(((InternetAddress) message.getReplyTo()[0]).getAddress()).isEqualTo(mail.replyTo());
        }

        Part body = findHtmlPart(message);
        assertThat(body).as("HTML MIME body").isNotNull();
        assertThat(new ContentType(body.getContentType()).getParameter("charset"))
                .isEqualToIgnoringCase(StandardCharsets.UTF_8.name());
        String html = (String) body.getContent();
        Matcher meta = Pattern.compile("(?is)<head>.*?<meta\\s+charset=[\"']([^\"']+)[\"']\\s*/?>.*?</head>")
                .matcher(html);
        assertThat(meta.find()).as("HTML head declares its charset").isTrue();
        assertThat(meta.group(1)).isEqualToIgnoringCase(StandardCharsets.UTF_8.name());
        assertThat(html)
                .contains(mail.expectedHtml().toArray(String[]::new))
                .doesNotContain("<script>", "<b>홍길동</b>", "<b>김사장</b>", "<b>계정</b>");
    }

    static Stream<MailCase> mailCases() {
        return Stream.of(
                new MailCase("이메일 인증", service -> service.sendVerificationEmail(MEMBER_EMAIL, "742915"),
                        MEMBER_EMAIL, "[RESERVE] 이메일 인증 코드", null,
                        List.of("이메일 인증을", "742915")),
                new MailCase("예약 취소", service -> service.sendReservationCancelledByStoreEmail(
                        MEMBER_EMAIL, MEMBER_NAME, STORE_NAME, "2026-10-03", "오후 2시", 3, REASON),
                        MEMBER_EMAIL, "[RESERVE] 예약이 취소되었습니다", null,
                        List.of(MEMBER_HTML, STORE_HTML, "2026-10-03", "오후 2시", "3명", REASON_HTML)),
                new MailCase("사업자 신규 예약", service -> service.sendNewReservationAlertToOwner(
                        OWNER_EMAIL, "점주 한글 🏠 <b>김사장</b>", STORE_NAME, MEMBER_NAME, MEMBER_EMAIL,
                        "2026-10-03", "오후 2시", 3),
                        OWNER_EMAIL, "[RESERVE] 새로운 예약이 접수되었습니다", MEMBER_EMAIL,
                        List.of("점주 한글 🏠 &lt;b&gt;김사장&lt;/b&gt;", STORE_HTML, MEMBER_HTML,
                                "mailto:" + MEMBER_EMAIL, "오후 2시", "3명")),
                new MailCase("사업자 승인", service -> service.sendBusinessApprovedEmail(
                        MEMBER_EMAIL, MEMBER_NAME, STORE_NAME),
                        MEMBER_EMAIL, "[RESERVE] 사업자 인증이 승인되었습니다", null,
                        List.of(MEMBER_HTML, STORE_HTML, "예약팀 한글 caf&eacute; 🌿", "사업자 인증이 완료되었습니다!")),
                new MailCase("사업자 반려", service -> service.sendBusinessRejectedEmail(
                        MEMBER_EMAIL, MEMBER_NAME, STORE_NAME, REASON),
                        MEMBER_EMAIL, "[RESERVE] 사업자 인증이 반려되었습니다", null,
                        List.of(MEMBER_HTML, STORE_HTML, "예약팀 한글 caf&eacute; 🌿", REASON_HTML)),
                new MailCase("운영자 문의", service -> service.sendNewInquiryAlert(
                        MEMBER_NAME, MEMBER_EMAIL, "결제 & <b>계정</b>",
                        "예약 문의 café 🌿\r\nBcc: hidden@example.test", REASON),
                        ADMIN_EMAIL, "[RESERVE 문의] 예약 문의 café 🌿 Bcc: hidden@example.test", MEMBER_EMAIL,
                        List.of(MEMBER_HTML, "결제 &amp; &lt;b&gt;계정&lt;/b&gt;", "예약 문의 caf&eacute; 🌿",
                                "mailto:" + MEMBER_EMAIL, REASON_HTML)),
                new MailCase("비밀번호 재설정", service -> service.sendPasswordResetEmail(MEMBER_EMAIL, "528361"),
                        MEMBER_EMAIL, "[RESERVE] 비밀번호 재설정 코드", null,
                        List.of("비밀번호를", "528361")));
    }

    @Test
    @DisplayName("취소·거절·반려는 같은 강조색을 쓰면서 각 상태와 사유 안내를 구분한다")
    void declinedMailsShareAnAccentWithoutLosingTheirDistinctMeaning() throws Exception {
        String cancelled = htmlBody(deliver(service -> service.sendReservationCancelledByStoreEmail(
                MEMBER_EMAIL, MEMBER_NAME, STORE_NAME, "2026-10-03", "오후 2시", 3, REASON)));
        String rejected = htmlBody(deliver(service -> service.sendReservationRejectedEmail(
                MEMBER_EMAIL, MEMBER_NAME, STORE_NAME, "2026-10-03", "오후 2시", 3, REASON)));
        String businessRejected = htmlBody(deliver(service -> service.sendBusinessRejectedEmail(
                MEMBER_EMAIL, MEMBER_NAME, STORE_NAME, REASON)));
        String approved = htmlBody(deliver(service -> service.sendReservationConfirmedEmail(
                MEMBER_EMAIL, MEMBER_NAME, STORE_NAME, "2026-10-03", "오후 2시", 3)));

        assertThat(cancelled).contains("취소 사유", REASON_HTML, "전액 환불").doesNotContain("거절 사유");
        assertThat(rejected).contains("거절 사유", REASON_HTML).doesNotContain("취소 사유", "전액 환불");
        assertThat(businessRejected).contains("반려 사유", REASON_HTML);
        assertThat(statusAccent(cancelled, "취소"))
                .isEqualTo(statusAccent(rejected, "거절"))
                .isEqualTo(statusAccent(businessRejected, "반려"))
                .isNotEqualTo(statusAccent(approved, "승인"));
    }

    private static MimeMessage deliver(Consumer<EmailService> send) throws Exception {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        Session session = Session.getInstance(new Properties());
        MimeMessage outgoing = new MimeMessage(session);
        when(mailSender.createMimeMessage()).thenReturn(outgoing);
        EmailService service = new EmailService(mailSender);
        ReflectionTestUtils.setField(service, "fromEmail", FROM_EMAIL);
        ReflectionTestUtils.setField(service, "fromName", FROM_NAME);
        ReflectionTestUtils.setField(service, "adminNotifyEmail", ADMIN_EMAIL);

        send.accept(service);

        verify(mailSender).createMimeMessage();
        verify(mailSender).send(outgoing);
        verifyNoMoreInteractions(mailSender);
        outgoing.saveChanges();
        String originalHtml = htmlBody(outgoing);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        outgoing.writeTo(bytes);
        MimeMessage received = new MimeMessage(session, new ByteArrayInputStream(bytes.toByteArray()));
        assertThat(htmlBody(received)).as("HTML survives MIME serialization").isEqualTo(originalHtml);
        return received;
    }

    private static String htmlBody(MimeMessage message) throws Exception {
        Part body = findHtmlPart(message);
        assertThat(body).as("HTML MIME body").isNotNull();
        return (String) body.getContent();
    }

    private static Part findHtmlPart(Part part) throws Exception {
        if (part.isMimeType("text/html")) {
            return part;
        }
        if (part.isMimeType("multipart/*")) {
            Multipart multipart = (Multipart) part.getContent();
            for (int index = 0; index < multipart.getCount(); index++) {
                Part html = findHtmlPart(multipart.getBodyPart(index));
                if (html != null) {
                    return html;
                }
            }
        }
        return null;
    }

    private static String statusAccent(String html, String label) {
        Matcher badge = Pattern.compile("<div style=\"([^\"]*)\">" + Pattern.quote(label) + "</div>")
                .matcher(html);
        assertThat(badge.find()).as("status badge for %s", label).isTrue();
        Matcher background = Pattern.compile("(?:^|;)background:([^;]+)").matcher(badge.group(1));
        assertThat(background.find()).as("status badge background for %s", label).isTrue();
        return background.group(1);
    }

    private record MailCase(String label, Consumer<EmailService> send, String recipient,
                            String subject, String replyTo, List<String> expectedHtml) {
        @Override
        public String toString() {
            return label;
        }
    }
}
