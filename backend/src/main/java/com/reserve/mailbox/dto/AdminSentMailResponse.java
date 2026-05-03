package com.reserve.mailbox.dto;

import com.reserve.mailbox.entity.AdminSentMail;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@Builder
public class AdminSentMailResponse {

    private Long id;
    private String toEmail;
    private String subject;
    private String body;
    private String bodyPreview;
    private LocalDateTime sentAt;

    public static AdminSentMailResponse from(AdminSentMail mail) {
        String body = mail.getBody();
        String preview = (body != null && body.length() > 80)
                ? body.substring(0, 80) + "…"
                : body;

        return AdminSentMailResponse.builder()
                .id(mail.getId())
                .toEmail(mail.getToEmail())
                .subject(mail.getSubject())
                .body(body)
                .bodyPreview(preview)
                .sentAt(mail.getSentAt())
                .build();
    }
}
