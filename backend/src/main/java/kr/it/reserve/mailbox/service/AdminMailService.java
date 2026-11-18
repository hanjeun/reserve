package kr.it.reserve.mailbox.service;

import kr.it.reserve.global.error.BusinessException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.file.service.SupportMailPhotos;
import kr.it.reserve.file.util.ImageFileValidator.ValidatedImage;
import kr.it.reserve.mailbox.dto.AdminSentMailResponse;
import kr.it.reserve.mailbox.dto.ComposeMailRequest;
import kr.it.reserve.mailbox.entity.AdminSentMail;
import kr.it.reserve.mailbox.repository.AdminSentMailRepository;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MultipartFile;

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
            "Pretendard, 'Pretendard Variable', 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif";

    private final AdminSentMailRepository sentMailRepository;
    private final JavaMailSender mailSender;
    private final MemberRepository memberRepository;
    private final AuditLogService auditLogService;
    private final RateLimiter rateLimiter;
    private final SupportMailPhotos mailPhotos;

    @Value("${mail.from:${mail.username}}")
    private String fromEmail;

    @Value("${mail.from-name:RESERVE}")
    private String fromName;

    @Value("${mail.resend-inbound.recipient:}")
    private String inboundAddress;

    /* 새 메일 작성 발송 + DB 저장 ───────────────────── */
    @Transactional
    public void compose(long adminId, ComposeMailRequest request, List<MultipartFile> uploads) {
        if (request.isMarketing()) {
            requireMarketingConsent(request.getToEmail());
        }
        requireSendAllowance(adminId);
        sendAndSave(request.getToEmail(), request.getSubject(), request.getBody(), null, null,
                SupportMailPhotos.validateUploads(uploads));
    }

    @Transactional
    public void sendInquiryReply(long adminId, String email, String subject, String answer, boolean inbound, String messageId,
            List<ValidatedImage> photos) {
        requireSendAllowance(adminId);
        sendAndSave(email, subject, answer, inbound ? inboundAddress : null, messageId, photos);
    }

    private void requireSendAllowance(long adminId) {
        if (!rateLimiter.tryConsume(Long.toString(adminId), RateLimiter.Policy.ADMIN_MAIL_SEND)) {
            throw new BusinessException("메일 발송 요청이 너무 많아요. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
    }

    private void sendAndSave(String email, String subject, String body, String replyTo, String messageId, List<ValidatedImage> photos) {
        AdminSentMail sent = AdminSentMail.builder()
                .toEmail(email)
                .subject(subject)
                .body(body)
                .build();
        sentMailRepository.save(sent);
        mailPhotos.saveSent(sent.getId(), photos);
        sendReplyEmail(email, subject, body, replyTo, messageId, photos);

        log.info("Mail composed and saved: mailId={}", sent.getId());
    }

    /**
     * 정보통신망법상 광고성 정보는 사전 동의가 필요하다.
     * 회원이 아니거나 동의를 확인할 수 없는 주소에는 광고 메일을 보내지 않는다.
     */
    private void requireMarketingConsent(String toEmail) {
        // 탈퇴 회원을 제외하는 조회를 쓴다. findByEmail 은 소프트 삭제된 회원도 잡는데,
        //   탈퇴한 사람에게 광고를 보내는 건 동의 없이 보내는 것보다 나쁘다.
        Member member = memberRepository.findByEmailAndDeletedAtIsNull(toEmail).orElse(null);

        if (member == null) {
            log.warn("Marketing mail blocked - recipient is not an active member");
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "회원이 아닌 주소로는 광고성 메일을 보낼 수 없어요. 광고가 아니라면 '광고성 정보' 체크를 해제해주세요.");
        }
        if (!member.isMarketingAgreed()) {
            log.warn("Marketing mail blocked - consent not given: memberId={}", member.getId());
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "이 회원은 마케팅 정보 수신에 동의하지 않았어요. 광고가 아니라면 '광고성 정보' 체크를 해제해주세요.");
        }
    }

    /* 보낸 메일 목록 ─────────────────────────────────── */
    /** 한 번에 내려줄 수 있는 최대 건수. 호출측이 큰 size 를 보내 전량을 끌어가지 못하게 막는다. */
    private static final int MAX_PAGE_SIZE = 100;

    public Page<AdminSentMailResponse> getSentMailList(int page, int size, String search) {
        int safeSize = Math.clamp(size, 1, MAX_PAGE_SIZE);
        int safePage = Math.max(page, 0);
        Pageable pageable = PageRequest.of(safePage, safeSize);

        String keyword = search != null ? search.trim() : "";
        Page<AdminSentMail> mails = keyword.isEmpty()
                ? sentMailRepository.findByDeletedAtIsNullOrderBySentAtDesc(pageable)
                : sentMailRepository.searchByToEmailOrSubject(keyword, pageable);

        return mails.map(AdminSentMailResponse::from);
    }

    /* 휴지통으로 이동 ────────────────────────────────── */

    /** 휴지통에서 복구할 수 있도록 목록에서만 숨기며 보존 기간 뒤 정리한다. */
    @Transactional
    public void moveToTrash(Long mailId) {
        // 엔티티 로드·softDelete·감사 로그 기록이 한 곳에 묶여 있다.
        // 여기서 다시 구현하면 감사 로그를 빠뜨리기 쉬워 그대로 위임한다.
        auditLogService.softDeleteSentMail(mailId);
    }

    public List<Long> getPhotoIds(Long mailId) {
        requireVisibleMail(mailId);
        return mailPhotos.sentIds(mailId);
    }

    public ResponseEntity<byte[]> getPhoto(Long mailId, Long photoId) {
        requireVisibleMail(mailId);
        return mailPhotos.sentPhoto(mailId, photoId);
    }

    private void requireVisibleMail(Long mailId) {
        sentMailRepository.findById(mailId).filter(mail -> !mail.isDeleted()).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "메일을 찾을 수 없어요."));
    }

    /* 이메일 발송 내부 메서드 ────────────────────────── */
    private void sendReplyEmail(String toEmail, String subject, String body, String replyTo, String messageId,
            List<ValidatedImage> photos) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(fromEmail, fromName);
            helper.setTo(toEmail);
            helper.setSubject(subject);
            if (replyTo != null && !replyTo.isBlank()) helper.setReplyTo(replyTo);
            if (messageId != null) {
                message.setHeader("In-Reply-To", messageId);
                message.setHeader("References", messageId);
            }
            helper.setText(buildReplyHtml(body), true);
            for (int i = 0; i < photos.size(); i++) {
                ValidatedImage photo = photos.get(i);
                helper.addAttachment(SupportMailPhotos.filename(photo, i + 1), new ByteArrayResource(photo.bytes()), photo.contentType());
            }
            mailSender.send(message);
        } catch (MessagingException | UnsupportedEncodingException | MailException e) {
            log.error("Mail send failed: errorType={}", e.getClass().getSimpleName());
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "메일 발송 중 오류가 발생했어요.");
        }
    }

    public String buildReplyHtml(String body) {
        // 개행 → <br> 변환
        String htmlBody = body.replace("&", "&amp;")
                              .replace("<", "&lt;")
                              .replace(">", "&gt;")
                              .replace("\r\n", "\n").replace("\r", "\n").replace("\n", "<br>");

        return "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"></head>"
            + "<body style=\"margin:0;padding:0;font-family:" + FONT_FAMILY + ";background:#f9fafb;\">"
            + "<div style=\"width:100%;background:#f9fafb;padding:40px 0;\">"
            + "  <div style=\"max-width:500px;margin:0 auto;background:#fff;border-radius:24px;padding:48px 32px;box-shadow:0 4px 12px rgba(0,0,0,0.05);\">"
            + "    <div style=\"margin-bottom:24px;\">"
            + "      <span style=\"font-size:20px;font-weight:800;color:#3182f6;\">RESERVE</span>"
            + "    </div>"
            + "    <p style=\"font-family:" + FONT_FAMILY + ";font-size:15px;font-weight:500;color:#191f28;line-height:1.8;white-space:pre-wrap;\">" + htmlBody + "</p>"
            + "    <div style=\"font-size:13px;color:#b0b8c1;border-top:1px solid #f2f4f6;padding-top:20px;margin-top:32px;\">"
            + "      © 2026 RESERVE. All rights reserved."
            + "    </div>"
            + "  </div>"
            + "</div></body></html>";
    }
}
