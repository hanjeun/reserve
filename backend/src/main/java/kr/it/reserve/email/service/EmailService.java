package kr.it.reserve.email.service;

import kr.it.reserve.global.error.EmailException;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import java.io.UnsupportedEncodingException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;

/** 비동기 메일 실패는 {@link MailException}까지 기록한다. 알림 규칙이 참조하는 로그 문구를 유지하고 개인정보·원문 예외는 남기지 않는다. */
@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {

    private static final String MAIL_CHARSET = "UTF-8";
    private static final String DECLINED_COLOR = "#ff4d4f";
    private static final String HTML_HEAD_OPEN = "<!DOCTYPE html><html><head><meta charset=\"UTF-8\">";

    // Gmail은 @import CSS를 차단하므로 웹폰트 대신 시스템 폰트 스택 사용
    private static final String FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif";
    private static final String FONT_IMPORT = ""; // Gmail은 @import 차단, 사용 안 함

    private final JavaMailSender mailSender;

    @Value("${mail.from:${mail.username}}")
    private String fromEmail;

    @Value("${mail.from-name:RESERVE}")
    private String fromName;

    @Value("${mail.admin-notify:hanjeun111@gmail.com}")
    private String adminNotifyEmail;

    @Async("mailExecutor")
    public void sendVerificationEmail(String toEmail, String verificationCode) {
        sendVerificationMessage(toEmail, verificationCode, false);
    }

    @Async("mailExecutor")
    public void sendLoginMethodVerificationEmail(String toEmail, String verificationCode) {
        sendVerificationMessage(toEmail, verificationCode, true);
    }

    private void sendVerificationMessage(String toEmail, String verificationCode, boolean loginMethod) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, MAIL_CHARSET);
            helper.setFrom(fromEmail, fromName);
            helper.setTo(toEmail);
            helper.setSubject(loginMethod ? "[RESERVE] 이메일 로그인 설정 인증 코드" : "[RESERVE] 이메일 인증 코드");
            helper.setText(buildVerificationEmailContent(verificationCode, loginMethod), true);
            mailSender.send(message);
            log.info("Verification email sent");
        } catch (MessagingException | UnsupportedEncodingException | MailException e) {
            log.error("Email send failed: errorType={}", e.getClass().getSimpleName());
            throw new EmailException("인증 이메일 발송 중 서버 오류가 발생했어요.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Async("mailExecutor")
    public void sendLoginMethodChangedEmail(String toEmail) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, MAIL_CHARSET);
            helper.setFrom(fromEmail, fromName);
            helper.setTo(toEmail);
            helper.setSubject("[RESERVE] 로그인 방법이 변경됐어요");
            helper.setText(buildLoginMethodChangedContent(), true);
            mailSender.send(message);
            log.info("Login method notification sent");
        } catch (MessagingException | UnsupportedEncodingException | MailException exception) {
            log.error("Email send failed: errorType={}", exception.getClass().getSimpleName());
            throw new EmailException("보안 알림 메일 발송에 실패했어요.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    private String buildLoginMethodChangedContent() {
        return HTML_HEAD_OPEN + FONT_IMPORT + "</head>"
            + "<body style=\"margin:0;padding:0;font-family:" + FONT_FAMILY + ";background:#f9fafb;\">"
            + "<div style=\"width:100%;background:#f9fafb;padding:40px 0;\">"
            + "  <div style=\"max-width:500px;margin:0 auto;background:#fff;border-radius:24px;padding:48px 32px;box-shadow:0 4px 12px rgba(0,0,0,0.05);\">"
            + "    <div style=\"margin-bottom:24px;\"><span style=\"font-size:20px;font-weight:800;color:#3182f6;font-family:" + FONT_FAMILY + ";\">RESERVE</span></div>"
            + "    <div style=\"display:inline-block;background:#3182f6;color:#fff;font-size:13px;font-weight:700;border-radius:20px;padding:4px 14px;margin-bottom:16px;\">보안 알림</div>"
            + "    <h1 style=\"font-size:22px;font-weight:700;color:#191f28;line-height:1.4;margin:0 0 12px;font-family:" + FONT_FAMILY + ";\">로그인 방법이 변경됐어요.</h1>"
            + "    <p style=\"font-size:15px;color:#4e5968;line-height:1.8;margin:0 0 28px;\">마이페이지의 로그인 및 보안에서 현재 로그인 방법을 확인할 수 있어요.</p>"
            + "    <div style=\"background:#f2f4f6;border-radius:16px;padding:24px;margin-bottom:28px;\">"
            + "      <p style=\"font-size:15px;color:#191f28;line-height:1.8;margin:0;\">본인이 변경하지 않았다면 계정 접근을 확인하고 RESERVE에 문의해주세요.</p>"
            + "    </div>"
            + "    <div style=\"font-size:13px;color:#b0b8c1;border-top:1px solid #f2f4f6;padding-top:20px;\">© 2026 RESERVE. All rights reserved.</div>"
            + "  </div>"
            + "</div></body></html>";
    }

    /** 예약 승인 알림 → 유저 */
    @Async("mailExecutor")
    public void sendReservationConfirmedEmail(String toEmail, String memberName,
                                              String storeName, String reservationDate,
                                              String reservationTime, int guestCount) {
        String name = resolveName(memberName, toEmail);
        sendReservationStatusEmail(toEmail, "[RESERVE] 예약이 승인됐어요",
                buildReservationStatusContent(name, new ReservationMailDetails(storeName, reservationDate,
                        reservationTime, guestCount), "승인", "#1db954", "예약이 확정됐어요! 방문 당일 즐거운 시간 되세요.", null, null));
    }

    /**
     * 가게 사정에 의한 예약 취소 알림 → 유저.
     *
     * <p>거절 메일과 따로 둔다 — 거절은 "아직 승인 안 된 요청을 안 받는 것"이고,
     * 취소는 "이미 확정된 약속을 가게가 깬 것"이다. 사용자가 받는 충격이 다르므로
     * 문구도 다르고, 환불 안내가 반드시 들어가야 한다.
     */
    @Async("mailExecutor")
    public void sendReservationCancelledByStoreEmail(String toEmail, String memberName,
                                                     String storeName, String reservationDate,
                                                     String reservationTime, int guestCount,
                                                     String cancelReason) {
        String name = resolveName(memberName, toEmail);
        sendReservationStatusEmail(toEmail, "[RESERVE] 예약이 취소됐어요",
                buildReservationStatusContent(name, new ReservationMailDetails(storeName, reservationDate,
                        reservationTime, guestCount), "취소", DECLINED_COLOR,
                        "가게 사정으로 예약이 취소됐어요. 결제하신 예약금은 전액 환불돼요.",
                        cancelReason, "취소 사유"));
    }

    /** 예약 거절 알림 → 유저 */
    @Async("mailExecutor")
    public void sendReservationRejectedEmail(String toEmail, String memberName,
                                             String storeName, String reservationDate,
                                             String reservationTime, int guestCount,
                                             String rejectionReason) {
        String name = resolveName(memberName, toEmail);
        sendReservationStatusEmail(toEmail, "[RESERVE] 예약이 거절됐어요",
                buildReservationStatusContent(name, new ReservationMailDetails(storeName, reservationDate,
                        reservationTime, guestCount), "거절", DECLINED_COLOR, "아쉽게도 예약이 거절됐어요. 다른 날짜에 다시 시도해보세요.",
                        rejectionReason, "거절 사유"));
    }

    /** 승인 취소 시 예약이 다시 대기 상태임을 알린다. */
    @Async("mailExecutor")
    public void sendReservationApprovalRevokedEmail(String toEmail, String memberName,
                                                    String storeName, String reservationDate,
                                                    String reservationTime, int guestCount) {
        String name = resolveName(memberName, toEmail);
        sendReservationStatusEmail(toEmail, "[RESERVE] 예약 승인이 취소됐어요",
                buildReservationStatusContent(name, new ReservationMailDetails(storeName, reservationDate,
                        reservationTime, guestCount), "대기", "#faad14",
                        "앞서 보내드린 승인 안내를 취소해요. 예약은 다시 승인 대기 상태예요.",
                        null, null));
    }

    public record ReservationMailDetails(String storeName, String reservationDate,
                                         String reservationTime, int guestCount) {}

    /** 신규 예약 알림 → 사장님 */
    @Async("mailExecutor")
    public void sendNewReservationAlertToOwner(String ownerEmail, String ownerName,
                                               String memberName, String memberEmail,
                                               ReservationMailDetails details) {
        String oName = resolveName(ownerName, ownerEmail);
        String mName = resolveName(memberName, memberEmail);
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, MAIL_CHARSET);
            helper.setFrom(fromEmail, fromName);
            helper.setTo(ownerEmail);
            if (memberEmail != null && !memberEmail.isBlank()) {
                helper.setReplyTo(memberEmail);  // 사장님이 이 메일에 바로 "답장" 누르면 예약자한테 감
            }
            helper.setSubject("[RESERVE] 새로운 예약이 접수됐어요");
            helper.setText(buildOwnerAlertContent(oName, details.storeName(), mName, memberEmail,
                    details.reservationDate(), details.reservationTime(), details.guestCount()), true);
            mailSender.send(message);
            log.info("Reservation notification email sent: recipient=owner");
        } catch (MessagingException | UnsupportedEncodingException | MailException e) {
            log.error("Reservation notification email failed: recipient=owner, errorType={}",
                    e.getClass().getSimpleName());
        }
    }

    private void sendReservationStatusEmail(String toEmail, String subject, String htmlContent) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, MAIL_CHARSET);
            helper.setFrom(fromEmail, fromName);
            helper.setTo(toEmail);
            helper.setSubject(subject);
            helper.setText(htmlContent, true);
            mailSender.send(message);
            log.info("Reservation notification email sent: recipient=member");
        } catch (MessagingException | UnsupportedEncodingException | MailException e) {
            log.error("Reservation notification email failed: recipient=member, errorType={}",
                    e.getClass().getSimpleName());
        }
    }

    /**
     * @param reason 사유가 없으면 해당 행을 표시하지 않는다.
     * @param reasonLabel 메일 유형에 맞는 사유 라벨
     */
    private String buildReservationStatusContent(String memberName, ReservationMailDetails details,
                                                  String statusLabel, String statusColor,
                                                  String statusMessage, String reason, String reasonLabel) {
        String safeMemberName = escapeHtml(memberName);
        String safeStoreName = escapeHtml(details.storeName());
        String safeReservationDate = escapeHtml(details.reservationDate());
        String safeReservationTime = escapeHtml(details.reservationTime());
        int guestCount = details.guestCount();
        String safeStatusLabel = escapeHtml(statusLabel);
        String safeStatusMessage = escapeHtml(statusMessage);
        String safeReason = escapeHtmlWithLineBreaks(reason);
        String safeReasonLabel = escapeHtml(reasonLabel != null ? reasonLabel : "사유");
        String reasonRow = reason != null
                ? "<tr><td style=\"color:#8b95a1;padding:8px 0;\">" + safeReasonLabel
                  + "</td><td style=\"color:#191f28;font-weight:600;\">" + safeReason + "</td></tr>"
                : "";
        return HTML_HEAD_OPEN + FONT_IMPORT + "</head>"
            + "<body style=\"margin:0;padding:0;font-family:" + FONT_FAMILY + ";background:#f9fafb;\">"
            + "<div style=\"width:100%;background:#f9fafb;padding:40px 0;\">"
            + "  <div style=\"max-width:500px;margin:0 auto;background:#fff;border-radius:24px;padding:48px 32px;box-shadow:0 4px 12px rgba(0,0,0,0.05);\">"
            + "    <div style=\"margin-bottom:24px;\"><span style=\"font-size:20px;font-weight:800;color:#3182f6;font-family:" + FONT_FAMILY + ";\">RESERVE</span></div>"
            + "    <div style=\"display:inline-block;background:" + statusColor + ";color:#fff;font-size:13px;font-weight:700;border-radius:20px;padding:4px 14px;margin-bottom:16px;\">" + safeStatusLabel + "</div>"
            + "    <h1 style=\"font-size:22px;font-weight:700;color:#191f28;margin:0 0 8px;font-family:" + FONT_FAMILY + ";\">" + safeMemberName + "님, " + safeStatusMessage + "</h1>"
            + "    <p style=\"font-size:15px;color:#4e5968;margin:0 0 28px;\">예약 정보를 확인해주세요.</p>"
            + "    <div style=\"background:#f2f4f6;border-radius:16px;padding:24px;margin-bottom:28px;\">"
            + "      <table style=\"width:100%;border-collapse:collapse;font-family:" + FONT_FAMILY + ";\">"
            + "        <tr><td style=\"color:#8b95a1;padding:8px 0;\">가게</td><td style=\"color:#191f28;font-weight:600;\">" + safeStoreName + "</td></tr>"
            + "        <tr><td style=\"color:#8b95a1;padding:8px 0;\">날짜</td><td style=\"color:#191f28;font-weight:600;\">" + safeReservationDate + "</td></tr>"
            + "        <tr><td style=\"color:#8b95a1;padding:8px 0;\">시간</td><td style=\"color:#191f28;font-weight:600;\">" + safeReservationTime + "</td></tr>"
            + "        <tr><td style=\"color:#8b95a1;padding:8px 0;\">인원</td><td style=\"color:#191f28;font-weight:600;\">" + guestCount + "명</td></tr>"
            + reasonRow
            + "      </table>"
            + "    </div>"
            + "    <div style=\"font-size:13px;color:#b0b8c1;border-top:1px solid #f2f4f6;padding-top:20px;\">© 2026 RESERVE. All rights reserved.</div>"
            + "  </div>"
            + "</div></body></html>";
    }

    private String buildOwnerAlertContent(String ownerName, String storeName, String memberName, String memberEmail,
                                           String reservationDate, String reservationTime, int guestCount) {
        String safeOwnerName = escapeHtml(ownerName);
        String safeStoreName = escapeHtml(storeName);
        String safeMemberName = escapeHtml(memberName);
        String safeMemberEmail = escapeHtml(memberEmail);
        String safeReservationDate = escapeHtml(reservationDate);
        String safeReservationTime = escapeHtml(reservationTime);
        String emailRow = (memberEmail != null && !memberEmail.isBlank())
            ? "<tr><td style=\"color:#8b95a1;padding:8px 0;\">고객 이메일</td><td style=\"color:#191f28;font-weight:600;\"><a href=\"mailto:" + safeMemberEmail + "\" style=\"color:#3182f6;text-decoration:none;\">" + safeMemberEmail + "</a></td></tr>"
            : "";
        return HTML_HEAD_OPEN + FONT_IMPORT + "</head>"
            + "<body style=\"margin:0;padding:0;font-family:" + FONT_FAMILY + ";background:#f9fafb;\">"
            + "<div style=\"width:100%;background:#f9fafb;padding:40px 0;\">"
            + "  <div style=\"max-width:500px;margin:0 auto;background:#fff;border-radius:24px;padding:48px 32px;box-shadow:0 4px 12px rgba(0,0,0,0.05);\">"
            + "    <div style=\"margin-bottom:24px;\"><span style=\"font-size:20px;font-weight:800;color:#3182f6;font-family:" + FONT_FAMILY + ";\">RESERVE</span></div>"
            + "    <div style=\"display:inline-block;background:#3182f6;color:#fff;font-size:13px;font-weight:700;border-radius:20px;padding:4px 14px;margin-bottom:16px;\">새 예약</div>"
            + "    <h1 style=\"font-size:22px;font-weight:700;color:#191f28;margin:0 0 8px;font-family:" + FONT_FAMILY + ";\">" + safeOwnerName + "님, 새로운 예약이 들어왔어요!</h1>"
            + "    <p style=\"font-size:15px;color:#4e5968;margin:0 0 28px;\">" + safeStoreName + "에 예약 요청이 접수됐어요. 확인 후 승인해주세요.</p>"
            + "    <div style=\"background:#f2f4f6;border-radius:16px;padding:24px;margin-bottom:28px;\">"
            + "      <table style=\"width:100%;border-collapse:collapse;font-family:" + FONT_FAMILY + ";\">"
            + "        <tr><td style=\"color:#8b95a1;padding:8px 0;\">고객명</td><td style=\"color:#191f28;font-weight:600;\">" + safeMemberName + "</td></tr>"
            + emailRow
            + "        <tr><td style=\"color:#8b95a1;padding:8px 0;\">날짜</td><td style=\"color:#191f28;font-weight:600;\">" + safeReservationDate + "</td></tr>"
            + "        <tr><td style=\"color:#8b95a1;padding:8px 0;\">시간</td><td style=\"color:#191f28;font-weight:600;\">" + safeReservationTime + "</td></tr>"
            + "        <tr><td style=\"color:#8b95a1;padding:8px 0;\">인원</td><td style=\"color:#191f28;font-weight:600;\">" + guestCount + "명</td></tr>"
            + "      </table>"
            + "    </div>"
            + "    <div style=\"font-size:13px;color:#b0b8c1;border-top:1px solid #f2f4f6;padding-top:20px;\">© 2026 RESERVE. All rights reserved.</div>"
            + "  </div>"
            + "</div></body></html>";
    }

    /** 사업자 인증 승인 알림 → 신청자 */
    @Async("mailExecutor")
    public void sendBusinessApprovedEmail(String toEmail, String memberName, String businessName) {
        String name = resolveName(memberName, toEmail);
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, MAIL_CHARSET);
            helper.setFrom(fromEmail, fromName);
            helper.setTo(toEmail);
            helper.setSubject("[RESERVE] 사업자 인증이 승인됐어요");
            helper.setText(buildBusinessStatusContent(
                name, businessName,
                "승인", "#1db954",
                "사업자 인증이 완료됐어요!",
                "이제 RESERVE에서 가게를 등록하고 예약을 받아보세요.",
                null
            ), true);
            mailSender.send(message);
            log.info("Business approval email sent");
        } catch (MessagingException | UnsupportedEncodingException | MailException e) {
            log.error("Business approval email failed: errorType={}", e.getClass().getSimpleName());
        }
    }

    @Async("mailExecutor")
    public void sendBusinessRejectedEmail(String toEmail, String memberName, String businessName, String rejectionReason) {
        String name = resolveName(memberName, toEmail);
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, MAIL_CHARSET);
            helper.setFrom(fromEmail, fromName);
            helper.setTo(toEmail);
            helper.setSubject("[RESERVE] 사업자 인증이 반려됐어요");
            helper.setText(buildBusinessStatusContent(
                name, businessName,
                "반려", DECLINED_COLOR,
                "아쉽게도 사업자 인증이 반려됐어요.",
                "반려 사유를 확인하신 후 서류를 수정하여 다시 신청해주세요.",
                rejectionReason
            ), true);
            mailSender.send(message);
            log.info("Business rejection email sent");
        } catch (MessagingException | UnsupportedEncodingException | MailException e) {
            log.error("Business rejection email failed: errorType={}", e.getClass().getSimpleName());
        }
    }

    /**
     * 이름 정리 — null/빈/기본값("사용자") 인 경우 이메일 앞부분으로 폴백
     */
    private String resolveName(String name, String email) {
        if (name == null || name.isBlank() || name.equals("사용자") || name.equals("고객"))
            return email != null ? email.split("@")[0] : "고객";
        return name;
    }

    /** 신규 문의 알림 → 운영자(개인 이메일) */
    @Async("mailExecutor")
    public void sendNewInquiryAlert(String memberName, String memberEmail, String categoryDisplayName, String title, String content) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, MAIL_CHARSET);
            helper.setFrom(fromEmail, fromName);
            helper.setTo(adminNotifyEmail);
            if (memberEmail != null && !memberEmail.isBlank()) {
                helper.setReplyTo(memberEmail);  // 관리자가 이 메일에 바로 "답장" 누르면 문의자에게 감
            }
            helper.setSubject("[RESERVE 문의] " + sanitizeSubject(title));
            helper.setText(buildInquiryAlertContent(memberName, memberEmail, categoryDisplayName, title, content), true);
            mailSender.send(message);
            log.info("New inquiry alert email sent to admin");
        } catch (MessagingException | UnsupportedEncodingException | MailException e) {
            log.error("Inquiry alert email failed: errorType={}", e.getClass().getSimpleName());
        }
    }

    private String buildInquiryAlertContent(String memberName, String memberEmail, String category, String title, String content) {
        String safeMemberName = escapeHtml(memberName);
        String safeMemberEmail = escapeHtml(memberEmail);
        String safeCategory = escapeHtml(category);
        String safeTitle = escapeHtml(title);
        String safeContent = escapeHtmlWithLineBreaks(content);
        String emailRow = (memberEmail != null && !memberEmail.isBlank())
            ? "<p style=\"font-size:14px;color:#4e5968;margin:0 0 24px;\">회신 이메일: <a href=\"mailto:" + safeMemberEmail + "\" style=\"color:#3182f6;text-decoration:none;\">" + safeMemberEmail + "</a></p>"
            : "";
        return "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"></head>"
            + "<body style=\"margin:0;padding:0;font-family:" + FONT_FAMILY + ";background:#f9fafb;\">"
            + "<div style=\"width:100%;background:#f9fafb;padding:40px 0;\">"
            + "  <div style=\"max-width:500px;margin:0 auto;background:#fff;border-radius:24px;padding:48px 32px;box-shadow:0 4px 12px rgba(0,0,0,0.05);\">"
            + "    <div style=\"margin-bottom:24px;\"><span style=\"font-size:20px;font-weight:800;color:#3182f6;\">RESERVE</span></div>"
            + "    <div style=\"display:inline-block;background:#3182f6;color:#fff;font-size:13px;font-weight:700;border-radius:20px;padding:4px 14px;margin-bottom:16px;\">새 문의</div>"
            + "    <h1 style=\"font-size:20px;font-weight:700;color:#191f28;margin:0 0 8px;\">" + safeTitle + "</h1>"
            + "    <p style=\"font-size:14px;color:#8b95a1;margin:0 0 4px;\">" + safeMemberName + " · " + safeCategory + "</p>"
            + emailRow
            + "    <div style=\"background:#f2f4f6;border-radius:16px;padding:24px;margin-bottom:20px;\">"
            + "      <p style=\"font-size:15px;color:#191f28;line-height:1.8;white-space:pre-wrap;margin:0;\">" + safeContent + "</p>"
            + "    </div>"
            + "    <div style=\"font-size:13px;color:#b0b8c1;border-top:1px solid #f2f4f6;padding-top:20px;\">관리자 패널에서 답변을 등록해주세요. © 2026 RESERVE.</div>"
            + "  </div>"
            + "</div></body></html>";
    }

    private String buildBusinessStatusContent(String memberName, String businessName,
                                               String statusLabel, String statusColor,
                                               String title, String subtitle,
                                               String rejectionReason) {
        String safeMemberName = escapeHtml(memberName);
        String safeBusinessName = escapeHtml(businessName);
        String safeStatusLabel = escapeHtml(statusLabel);
        String safeTitle = escapeHtml(title);
        String safeSubtitle = escapeHtml(subtitle);
        String safeRejectionReason = escapeHtmlWithLineBreaks(rejectionReason);
        String safeFromName = escapeHtml(fromName);
        String reasonBlock = rejectionReason != null
            ? "<div style=\"background:#fff3f3;border-radius:12px;padding:16px 20px;margin-bottom:20px;border-left:3px solid #ff4d4f;\">"
              + "<span style=\"font-size:13px;color:#ff4d4f;font-weight:700;\">반려 사유</span>"
              + "<p style=\"font-size:14px;color:#4e5968;margin:6px 0 0;line-height:1.6;\">" + safeRejectionReason + "</p>"
              + "</div>"
            : "";
        return "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"></head>"
            + "<body style=\"margin:0;padding:0;font-family:" + FONT_FAMILY + ";background:#f9fafb;\">"
            + "<div style=\"width:100%;background:#f9fafb;padding:40px 0;\">"
            + "  <div style=\"max-width:500px;margin:0 auto;background:#fff;border-radius:24px;padding:48px 32px;box-shadow:0 4px 12px rgba(0,0,0,0.05);\">"
            + "    <div style=\"margin-bottom:24px;\"><span style=\"font-size:20px;font-weight:800;color:#3182f6;\">" + safeFromName + "</span></div>"
            + "    <div style=\"display:inline-block;background:" + statusColor + ";color:#fff;font-size:13px;font-weight:700;border-radius:20px;padding:4px 14px;margin-bottom:16px;\">" + safeStatusLabel + "</div>"
            + "    <h1 style=\"font-size:22px;font-weight:700;color:#191f28;margin:0 0 8px;\">" + safeMemberName + "님, " + safeTitle + "</h1>"
            + "    <p style=\"font-size:15px;color:#4e5968;margin:0 0 28px;\">" + safeSubtitle + "</p>"
            + "    <div style=\"background:#f2f4f6;border-radius:16px;padding:24px;margin-bottom:20px;\">"
            + "      <table style=\"width:100%;border-collapse:collapse;\">"
            + "        <tr><td style=\"color:#8b95a1;padding:8px 0;font-size:14px;\">상호명</td>"
            + "            <td style=\"color:#191f28;font-weight:600;font-size:14px;\">" + safeBusinessName + "</td></tr>"
            + "      </table>"
            + "    </div>"
            + reasonBlock
            + "    <div style=\"font-size:13px;color:#b0b8c1;border-top:1px solid #f2f4f6;padding-top:20px;\">© 2026 RESERVE. All rights reserved.</div>"
            + "  </div>"
            + "</div></body></html>";
    }

    private static String escapeHtml(String value) {
        return HtmlUtils.htmlEscape(value == null ? "" : value);
    }

    private static String escapeHtmlWithLineBreaks(String value) {
        return escapeHtml(value).replace("\r\n", "\n").replace("\r", "\n").replace("\n", "<br>");
    }

    private static String sanitizeSubject(String value) {
        return (value == null ? "" : value).replaceAll("[\\r\\n]+", " ").trim();
    }

    @Async("mailExecutor")
    public void sendPasswordResetEmail(String toEmail, String code) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, MAIL_CHARSET);
            helper.setFrom(fromEmail, fromName);
            helper.setTo(toEmail);
            helper.setSubject("[RESERVE] 비밀번호 재설정 코드");
            helper.setText(buildPasswordResetEmailContent(code), true);
            mailSender.send(message);
            log.info("Password reset email sent");
        } catch (MessagingException | UnsupportedEncodingException | MailException e) {
            log.error("Password reset email failed: errorType={}", e.getClass().getSimpleName());
        }
    }

    private String buildPasswordResetEmailContent(String code) {
        return HTML_HEAD_OPEN + FONT_IMPORT + "</head>"
            + "<body style=\"margin:0;padding:0;font-family:" + FONT_FAMILY + ";background-color:#f9fafb;\">"
            + "  <div style=\"width:100%;background-color:#f9fafb;padding:40px 0;\">"
            + "    <div style=\"max-width:500px;margin:0 auto;background-color:#ffffff;border-radius:24px;padding:48px 32px;box-shadow:0 4px 12px rgba(0,0,0,0.05);\">"
            + "      <div style=\"margin-bottom:32px;\"><span style=\"font-size:20px;font-weight:800;color:#3182f6;letter-spacing:-0.5px;font-family:" + FONT_FAMILY + ";\">RESERVE</span></div>"
            + "      <h1 style=\"font-size:24px;font-weight:700;color:#191f28;line-height:1.4;margin:0 0 12px 0;font-family:" + FONT_FAMILY + ";\">비밀번호를<br/>재설정해주세요.</h1>"
            + "      <p style=\"font-size:16px;color:#4e5968;line-height:1.6;margin:0 0 32px 0;\">아래 인증 코드를 입력해 비밀번호를 재설정하세요.<br/>코드는 5분간 유효해요.</p>"
            + "      <div style=\"background-color:#f2f4f6;border-radius:16px;padding:32px;text-align:center;margin-bottom:32px;\">"
            + "        <span style=\"display:block;font-size:14px;color:#8b95a1;margin-bottom:8px;\">인증번호</span>"
            + "        <span style=\"font-size:36px;font-weight:800;color:#3182f6;letter-spacing:8px;font-family:" + FONT_FAMILY + ";\">" + code + "</span>"
            + "      </div>"
            + "      <div style=\"font-size:13px;color:#b0b8c1;line-height:1.6;border-top:1px solid #f2f4f6;padding-top:24px;\">"
            + "        본인이 요청하지 않은 경우 이 이메일을 무시하세요.<br/>"
            + "        © 2026 RESERVE. All rights reserved."
            + "      </div>"
            + "    </div>"
            + "  </div>"
            + "</body></html>";
    }

    private String buildVerificationEmailContent(String code) {
        return buildVerificationEmailContent(code, false);
    }

    private String buildVerificationEmailContent(String code, boolean loginMethod) {
        return HTML_HEAD_OPEN + FONT_IMPORT + "</head>"
            + "<body style=\"margin:0;padding:0;font-family:" + FONT_FAMILY + ";background-color:#f9fafb;\">"
            + "  <div style=\"width:100%;background-color:#f9fafb;padding:40px 0;\">"
            + "    <div style=\"max-width:500px;margin:0 auto;background-color:#ffffff;border-radius:24px;padding:48px 32px;box-shadow:0 4px 12px rgba(0,0,0,0.05);\">"
            + "      <div style=\"margin-bottom:32px;\"><span style=\"font-size:20px;font-weight:800;color:#3182f6;letter-spacing:-0.5px;font-family:" + FONT_FAMILY + ";\">RESERVE</span></div>"
            + "      <h1 style=\"font-size:24px;font-weight:700;color:#191f28;line-height:1.4;margin:0 0 12px 0;font-family:" + FONT_FAMILY + ";\">이메일 인증을<br/>완료해주세요.</h1>"
            + "      <p style=\"font-size:16px;color:#4e5968;line-height:1.6;margin:0 0 32px 0;\">안녕하세요.<br/>서비스 이용을 위해 아래 인증 코드를 화면에 입력해주세요.</p>"
            + "      <div style=\"background-color:#f2f4f6;border-radius:16px;padding:32px;text-align:center;margin-bottom:32px;\">"
            + "        <span style=\"display:block;font-size:14px;color:#8b95a1;margin-bottom:8px;\">인증번호</span>"
            + "        <span style=\"font-size:36px;font-weight:800;color:#3182f6;letter-spacing:8px;font-family:" + FONT_FAMILY + ";\">" + code + "</span>"
            + "      </div>"
            + "      <div style=\"font-size:13px;color:#b0b8c1;line-height:1.6;border-top:1px solid #f2f4f6;padding-top:24px;\">"
            + (loginMethod ? "        본 메일은 기존 계정의 이메일 로그인 설정을 위한 본인 확인 메일이에요.<br/>"
                    : "        본 메일은 회원가입을 위한 본인 확인 메일이에요.<br/>")
            + "        인증 코드는 <span style=\"color:#8b95a1;\">5분간</span> 유효해요.<br/><br/>"
            + "        © 2026 RESERVE. All rights reserved."
            + "      </div>"
            + "    </div>"
            + "  </div>"
            + "</body></html>";
    }
}
