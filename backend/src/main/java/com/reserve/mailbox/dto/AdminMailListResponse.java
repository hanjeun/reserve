package com.reserve.mailbox.dto;

import com.reserve.mailbox.entity.AdminMail;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

/**
 * 메일 목록용 응답
 *
 * isRead 필드를 Boolean(래퍼)로 선언 → Lombok이 getIsRead() 생성
 * → Jackson이 "isRead"로 직렬화 (boolean 기본형은 isRead() → "read" 로 잘못 직렬화됨)
 */
@Getter
@Builder
public class AdminMailListResponse {

    private Long id;
    private String fromEmail;
    private String fromName;
    private String subject;
    private String bodyPreview;
    private Boolean isRead;   // Boolean 래퍼 → getIsRead() → "isRead" 직렬화
    private LocalDateTime receivedAt;

    public static AdminMailListResponse from(AdminMail mail) {
        String body = mail.getBody();
        String preview = (body != null && body.length() > 80)
                ? body.substring(0, 80) + "…"
                : body;

        return AdminMailListResponse.builder()
                .id(mail.getId())
                .fromEmail(mail.getFromEmail())
                .fromName(mail.getFromName())
                .subject(mail.getSubject())
                .bodyPreview(preview)
                .isRead(mail.isRead())
                .receivedAt(mail.getReceivedAt())
                .build();
    }
}
