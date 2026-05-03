package com.reserve.mailbox.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * ImprovMX 웹훅 수신 페이로드
 * ImprovMX가 POST로 전달하는 JSON 구조
 */
@Getter
@NoArgsConstructor
public class MailWebhookPayload {

    @JsonProperty("from")
    private String from;         // "홍길동 <user@example.com>" 또는 "user@example.com"

    @JsonProperty("to")
    private String to;

    @JsonProperty("subject")
    private String subject;

    @JsonProperty("text")
    private String text;         // 본문 (plain text) — 저장용

    @JsonProperty("html")
    private String html;         // 본문 (HTML) — 사용하지 않음 (XSS 방지)

    /** "홍길동 <user@example.com>" 형식에서 이메일만 추출 */
    public String parseEmail() {
        if (from == null) return null;
        int start = from.indexOf('<');
        int end   = from.indexOf('>');
        if (start != -1 && end != -1 && end > start) {
            return from.substring(start + 1, end).trim();
        }
        return from.trim();
    }

    /** "홍길동 <user@example.com>" 형식에서 이름만 추출 */
    public String parseName() {
        if (from == null) return null;
        int start = from.indexOf('<');
        if (start > 0) {
            return from.substring(0, start).trim();
        }
        return null;
    }
}
