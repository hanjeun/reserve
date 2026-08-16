package kr.it.reserve.mailbox.service;

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
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.io.UnsupportedEncodingException;

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
    private final MemberRepository memberRepository;

    @Value("${mail.from:${mail.username}}")
    private String fromEmail;

    @Value("${mail.from-name:RESERVE}")
    private String fromName;

    /* ── 새 메일 작성 발송 + DB 저장 ───────────────────── */
    @Transactional
    public void compose(ComposeMailRequest request) {
        if (request.isMarketing()) {
            requireMarketingConsent(request.getToEmail());
        }
        sendReplyEmail(request.getToEmail(), request.getSubject(), request.getBody());

        AdminSentMail sent = AdminSentMail.builder()
                .toEmail(request.getToEmail())
                .subject(request.getSubject())
                .body(request.getBody())
                .build();
        sentMailRepository.save(sent);

        log.info("Mail composed and saved: to={}", request.getToEmail());
    }

    /**
     * 광고성 메일의 수신 동의 확인 (2026-08-11 신설).
     *
     * <p><b>왜 필요했나</b> — 가입·마이페이지에서 마케팅 수신 동의를 받아 DB 에 저장하고 있었지만,
     * 그 값을 <b>읽는 코드가 한 줄도 없었다.</b> 동의를 관리하는 척만 하고 실제로는 아무것도
     * 강제하지 않는 상태였다. 정보통신망법상 광고성 정보는 사전 동의가 필요하고,
     * 수신 거부자에게 보내면 과태료 대상이다.
     *
     * <p>이 메일함은 임의의 주소로 보낼 수 있어 <b>회원이 아닌 주소</b>도 대상이 된다.
     * 그 경우엔 동의를 확인할 방법 자체가 없으므로 광고 발송을 거부한다 —
     * "확인할 수 없으면 보내지 않는다"가 안전한 기본값이다.
     */
    private void requireMarketingConsent(String toEmail) {
        // ★ 탈퇴 회원을 제외하는 조회를 쓴다. findByEmail 은 소프트 삭제된 회원도 잡는데,
        //   탈퇴한 사람에게 광고를 보내는 건 동의 없이 보내는 것보다 나쁘다.
        Member member = memberRepository.findByEmailAndDeletedAtIsNull(toEmail).orElse(null);

        if (member == null) {
            log.warn("Marketing mail blocked - not a member: to={}", toEmail);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "회원이 아닌 주소로는 광고성 메일을 보낼 수 없습니다. 광고가 아니라면 '광고성 정보' 체크를 해제해주세요.");
        }
        if (!member.isMarketingAgreed()) {
            log.warn("Marketing mail blocked - consent not given: memberId={}", member.getId());
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "이 회원은 마케팅 정보 수신에 동의하지 않았습니다. 광고가 아니라면 '광고성 정보' 체크를 해제해주세요.");
        }
    }

    /* ── 보낸 메일 목록 ─────────────────────────────────── */
    /** 한 번에 내려줄 수 있는 최대 건수. 호출측이 큰 size 를 보내 전량을 끌어가지 못하게 막는다. */
    private static final int MAX_PAGE_SIZE = 100;

    /**
     * 보낸 메일 목록 — 페이지 단위. {@code search} 가 있으면 받는사람·제목으로 서버에서 걸러낸다.
     *
     * <p>예전에는 페이지 개념 없이 전량을 내려주고 프론트가 {@code Array.filter} 했다.
     * 보낸 메일은 계속 쌓이기만 하는 데이터라 시간이 지날수록 응답이 커진다.
     */
    public Page<AdminSentMailResponse> getSentMailList(int page, int size, String search) {
        int safeSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        int safePage = Math.max(page, 0);
        Pageable pageable = PageRequest.of(safePage, safeSize);

        String keyword = search != null ? search.trim() : "";
        Page<AdminSentMail> mails = keyword.isEmpty()
                ? sentMailRepository.findByDeletedAtIsNullOrderBySentAtDesc(pageable)
                : sentMailRepository.searchByToEmailOrSubject(keyword, pageable);

        return mails.map(AdminSentMailResponse::from);
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
