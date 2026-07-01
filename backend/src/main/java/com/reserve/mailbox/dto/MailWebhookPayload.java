package com.reserve.mailbox.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * ImprovMX 웹훅 수신 페이로드
 *
 * ImprovMX 실제 전송 형식 (from/to 모두 객체):
 * {
 *   "from": { "name": "홍길동", "email": "user@example.com" },
 *   "to":   [{ "name": "RESERVE", "email": "reserve@reserve.it.kr" }],
 *   "subject": "문의사항",
 *   "text": "본문",
 *   "html": "<p>본문</p>"
 * }
 *
 * 주의: from이 flat string("홍길동 <email>")이 아닌 객체임.
 * 이전 파싱 방식(indexOf('<')) 제거.
 */
@Getter
@NoArgsConstructor
public class MailWebhookPayload {

    @JsonProperty("from")
    private EmailAddress from;

    @JsonProperty("to")
    private List<EmailAddress> to;

    @JsonProperty("subject")
    private String subject;

    @JsonProperty("text")
    private String text;       // plain text 저장용 (XSS 방지)

    @JsonProperty("html")
    private String html;       // 사용하지 않음

    /** 발신자 이메일 */
    public String parseEmail() {
        return from != null ? from.getEmail() : null;
    }

    /** 발신자 이름 (없으면 null) */
    public String parseName() {
        return from != null ? from.getName() : null;
    }

    // ── 중첩 DTO ─────────────────────────────────────────────────────────
    @Getter
    @NoArgsConstructor
    public static class EmailAddress {
        @JsonProperty("name")
        private String name;

        @JsonProperty("email")
        private String email;
    }
}
