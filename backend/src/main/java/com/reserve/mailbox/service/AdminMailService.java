package com.reserve.mailbox.service;

import com.reserve.mailbox.dto.*;
import com.reserve.mailbox.entity.AdminMail;
import com.reserve.mailbox.entity.AdminMailReply;
import com.reserve.mailbox.entity.AdminSentMail;
import com.reserve.mailbox.repository.AdminSentMailRepository;
import com.reserve.mailbox.repository.AdminMailRepository;
import com.reserve.mailbox.repository.AdminMailReplyRepository;
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

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminMailService {

    private static final String FONT_FAMILY =
            "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif";

    private final AdminMailRepository mailRepository;
    private final AdminMailReplyRepository replyRepository;
    private final AdminSentMailRepository sentMailRepository;
    private final JavaMailSender mailSender;

    @Value("${mail.from:${mail.username}}")
    private String fromEmail;

    @Value("${mail.from-name:RESERVE}")
    private String fromName;

    /* ── 웹훅 수신 저장 ─────────────────────────────────── */
    @Transactional
    public void receiveWebhook(MailWebhookPayload payload) {
        AdminMail mail = AdminMail.builder()
                .fromEmail(payload.parseEmail())
                .fromName(payload.parseName())
                .subject(payload.getSubject())
                .body(payload.getText())   // plain text만 저장 (XSS 방지)
                .build();
        mailRepository.save(mail);
        log.info("Mail received and saved: from={}, subject={}", mail.getFromEmail(), mail.getSubject());
    }

    /* ── 목록 조회 (삭제된 것 제외) ────────────────────────── */
    public List<AdminMailListResponse> getMailList() {
        return mailRepository.findByDeletedAtIsNullOrderByReceivedAtDesc()
                .stream()
                .map(AdminMailListResponse::from)
                .toList();
    }

    /* ── 상세 조회 + 읽음 처리 ──────────────────────────── */
    @Transactional
    public AdminMailDetailResponse getMailDetail(Long id) {
        AdminMail mail = mailRepository.findByIdWithReplies(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "메일을 찾을 수 없습니다."));
        if (!mail.isRead()) {
            mail.markAsRead();
        }
        return AdminMailDetailResponse.from(mail);
    }

    /* ── 읽지 않은 메일 개수 ────────────────────────────── */
    public long getUnreadCount() {
        return mailRepository.countByIsReadFalseAndDeletedAtIsNull();
    }

    /* ── 답장 발송 + 저장 ───────────────────────────────── */
    @Transactional
    public void reply(Long mailId, MailReplyRequest request) {
        AdminMail mail = mailRepository.findByIdWithReplies(mailId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "메일을 찾을 수 없습니다."));

        String replySubject = "Re: " + (mail.getSubject() != null ? mail.getSubject() : "");
        String toEmail = mail.getFromEmail();

        // Resend(JavaMailSender)로 이메일 발송
        sendReplyEmail(toEmail, replySubject, request.getBody());

        // 답장 히스토리 저장
        AdminMailReply replyEntity = AdminMailReply.builder()
                .adminMail(mail)
                .toEmail(toEmail)
                .subject(replySubject)
                .body(request.getBody())
                .build();
        replyRepository.save(replyEntity);

        log.info("Reply sent: to={}, subject={}", toEmail, replySubject);
    }

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
            log.error("Reply email failed ({}): {}", toEmail, e.getMessage());
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "답장 발송 중 오류가 발생했습니다.");
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
