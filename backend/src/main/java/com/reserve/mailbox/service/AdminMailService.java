package com.reserve.mailbox.service;

import com.reserve.mailbox.dto.AdminSentMailResponse;
import com.reserve.mailbox.dto.ComposeMailRequest;
import com.reserve.mailbox.entity.AdminSentMail;
import com.reserve.mailbox.repository.AdminSentMailRepository;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.io.UnsupportedEncodingException;
import java.util.List;

/**
 * 관리자 메일 발송 — 발송 전용 서비스.
 * (수신 웹훅 처리는 제거됨 — 문의는 Inquiry 도메인이 대신 담당)
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminMailService {

    private static final String FONT_FAMILY =
            "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif";

    private final AdminSentMailRepository sentMailRepository;
    private final JavaMailSender mailSender;

    @Value("${mail.from:${mail.username}}")
    private String fromEmail;

    @Value("${mail.from-name:RESERVE}")
    private String fromName;

    /* ── 새 메일 작성 발송 + DB 저장 ───────────────────── */
    @Transactional
    public void compose(ComposeMailRequest request) {
        sendReplyEmail(request.getToEmail(), request.getSubject(), request.getBody());

        AdminSentMail sent = AdminSentMail.builder()
                .toEmail(request.getToEmail())
                .subject(request.getSubject())
                .body(request.getBody())
                .build();
        sentMailRepository.save(sent);

        log.info("Mail composed and saved: to={}", request.getToEmail());
    }

    /* ── 보낸 메일 목록 ─────────────────────────────────── */
    public List<AdminSentMailResponse> getSentMailList() {
        return sentMailRepository.findByDeletedAtIsNullOrderBySentAtDesc()
                .stream()
                .map(AdminSentMailResponse::from)
                .toList();
    }

    /* ── 이메일 발송 내부 메서드 ────────────────────────── */
    private void sendReplyEmail(String toEmail, String subject, String body) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(fromEmail, fromName);
            helper.setTo(toEmail);
            helper.setSubject(subject);
            helper.setText(buildReplyHtml(body), true);
            mailSender.send(message);
        } catch (MessagingException | UnsupportedEncodingException e) {
            log.error("Mail send failed ({}): {}", toEmail, e.getMessage());
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "메일 발송 중 오류가 발생했습니다.");
        }
    }

    private String buildReplyHtml(String body) {
        // 개행 → <br> 변환
        String htmlBody = body.replace("&", "&amp;")
                              .replace("<", "&lt;")
                              .replace(">", "&gt;")
                              .replace("\n", "<br>");

        return "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"></head>"
            + "<body style=\"margin:0;padding:0;font-family:" + FONT_FAMILY + ";background:#f9fafb;\">"
            + "<div style=\"width:100%;background:#f9fafb;padding:40px 0;\">"
            + "  <div style=\"max-width:500px;margin:0 auto;background:#fff;border-radius:24px;padding:48px 32px;box-shadow:0 4px 12px rgba(0,0,0,0.05);\">"
            + "    <div style=\"margin-bottom:24px;\">"
            + "      <span style=\"font-size:20px;font-weight:800;color:#3182f6;\">RESERVE</span>"
            + "    </div>"
            + "    <p style=\"font-size:15px;color:#191f28;line-height:1.8;white-space:pre-wrap;\">" + htmlBody + "</p>"
            + "    <div style=\"font-size:13px;color:#b0b8c1;border-top:1px solid #f2f4f6;padding-top:20px;margin-top:32px;\">"
            + "      © 2026 RESERVE. All rights reserved."
            + "    </div>"
            + "  </div>"
            + "</div></body></html>";
    }
}
