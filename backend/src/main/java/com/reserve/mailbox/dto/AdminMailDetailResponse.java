package com.reserve.mailbox.dto;

import com.reserve.mailbox.entity.AdminMail;
import com.reserve.mailbox.entity.AdminMailReply;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 메일 상세 응답 (본문 전체 + 답장 목록 포함)
 * isRead → Boolean 래퍼로 선언하여 "isRead" 직렬화 보장
 */
@Getter
@Builder
public class AdminMailDetailResponse {

    private Long id;
    private String fromEmail;
    private String fromName;
    private String subject;
    private String body;
    private Boolean isRead;
    private LocalDateTime receivedAt;
    private List<ReplyResponse> replies;

    public static AdminMailDetailResponse from(AdminMail mail) {
        List<ReplyResponse> replies = mail.getReplies().stream()
                .map(ReplyResponse::from)
                .toList();

        return AdminMailDetailResponse.builder()
                .id(mail.getId())
                .fromEmail(mail.getFromEmail())
                .fromName(mail.getFromName())
                .subject(mail.getSubject())
                .body(mail.getBody())
                .isRead(mail.isRead())
                .receivedAt(mail.getReceivedAt())
                .replies(replies)
                .build();
    }

    @Getter
    @Builder
    public static class ReplyResponse {
        private Long id;
        private String toEmail;
        private String subject;
        private String body;
        private LocalDateTime sentAt;

        public static ReplyResponse from(AdminMailReply reply) {
            return ReplyResponse.builder()
                    .id(reply.getId())
                    .toEmail(reply.getToEmail())
                    .subject(reply.getSubject())
                    .body(reply.getBody())
                    .sentAt(reply.getSentAt())
                    .build();
        }
    }
}

