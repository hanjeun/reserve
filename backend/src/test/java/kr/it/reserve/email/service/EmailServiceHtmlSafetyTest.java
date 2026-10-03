package kr.it.reserve.email.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class EmailServiceHtmlSafetyTest {

    @Test
    @DisplayName("문의 알림은 제목·이름·유형·이메일·본문을 HTML로 해석하지 않는다")
    void inquiryAlertEscapesEveryUserControlledField() {
        EmailService service = new EmailService(mock(JavaMailSender.class));
        String payload = "<img src=x onerror=alert(1)>";
        String emailPayload = "member@example.test\" onclick=\"alert(1)";

        String html = ReflectionTestUtils.invokeMethod(
                service,
                "buildInquiryAlertContent",
                payload,
                emailPayload,
                payload,
                payload,
                "first line\n" + payload);

        assertThat(html)
                .doesNotContain("<img", "onclick=\"alert(1)\"")
                .contains("&lt;img src=x onerror=alert(1)&gt;",
                        "mailto:member@example.test&quot; onclick=&quot;alert(1)",
                        "first line<br>&lt;img src=x onerror=alert(1)&gt;");
    }

    @Test
    @DisplayName("예약·사업자 메일도 동적 값을 HTML로 해석하지 않는다")
    void otherTemplateBuildersEscapeDynamicFields() {
        EmailService service = new EmailService(mock(JavaMailSender.class));
        String payload = "<script>alert(1)</script>";

        String reservationHtml = ReflectionTestUtils.invokeMethod(
                service,
                "buildReservationStatusContent",
                payload, new EmailService.ReservationMailDetails(payload, payload, payload, 1),
                payload, "#000000", payload, payload, payload);
        String businessHtml = ReflectionTestUtils.invokeMethod(
                service,
                "buildBusinessStatusContent",
                payload, payload, payload, "#000000", payload, payload, payload);

        assertThat(reservationHtml).doesNotContain("<script>");
        assertThat(businessHtml).doesNotContain("<script>");
        assertThat(reservationHtml).contains("&lt;script&gt;alert(1)&lt;/script&gt;");
        assertThat(businessHtml).contains("&lt;script&gt;alert(1)&lt;/script&gt;");
    }

    @Test
    @DisplayName("문의 제목의 줄바꿈은 이메일 헤더에 남기지 않는다")
    void inquirySubjectRemovesLineBreaks() {
        EmailService service = new EmailService(mock(JavaMailSender.class));

        String subject = ReflectionTestUtils.invokeMethod(
                service, "sanitizeSubject", "정상 제목\r\nBcc: hidden@example.test");

        assertThat(subject).isEqualTo("정상 제목 Bcc: hidden@example.test");
    }
}
