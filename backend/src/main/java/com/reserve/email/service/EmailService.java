package com.reserve.email.service;

import com.reserve.global.error.EmailException;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import java.io.UnsupportedEncodingException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {

    // Gmail은 @import CSS를 차단하므로 웹폰트 대신 시스템 폰트 스택 사용
    private static final String FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif";
    private static final String FONT_IMPORT = ""; // Gmail은 @import 차단, 사용 안 함

    private final JavaMailSender mailSender;

    @Value("${mail.username}")
    private String fromEmail;

    @Value("${mail.from.name:RESERVE}")
    private String fromName;

    @Async
    public void sendVerificationEmail(String toEmail, String verificationCode) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(fromEmail, fromName);
            helper.setTo(toEmail);
            helper.setSubject("[RESERVE] 이메일 인증 코드");
            helper.setText(buildVerificationEmailContent(verificationCode), true);
            mailSender.send(message);
            log.info("인증 이메일 발송 완료: {}", toEmail);
        } catch (MessagingException | UnsupportedEncodingException e) {
            log.error("이메일 발송 실패: {}", e.getMessage());
            throw new EmailException("인증 이메일 발송 중 서버 오류가 발생했습니다.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // ─────────────────────────────────────────────────
    //  예약 알림 이메일
    // ─────────────────────────────────────────────────

    /** 예약 승인 알림 → 유저 */
    @Async
    public void sendReservationConfirmedEmail(String toEmail, String memberName,
                                              String storeName, String reservationDate,
                                              String reservationTime, int guestCount) {
        sendReservationStatusEmail(toEmail, "[RESERVE] 예약이 승인되었습니다",
                buildReservationStatusContent(memberName, storeName, reservationDate, reservationTime,
                        guestCount, "승인", "#1db954", "예약이 확정되었습니다! 방문 당일 즐거운 시간 되세요.", null));
    }

    /** 예약 거절 알림 → 유저 */
    @Async
    public void sendReservationRejectedEmail(String toEmail, String memberName,
                                             String storeName, String reservationDate,
                                             String reservationTime, int guestCount,
                                             String rejectionReason) {
        sendReservationStatusEmail(toEmail, "[RESERVE] 예약이 거절되었습니다",
                buildReservationStatusContent(memberName, storeName, reservationDate, reservationTime,
                        guestCount, "거절", "#ff4d4f", "아쉽게도 예약이 거절되었습니다. 다른 날짜에 다시 시도해보세요.", rejectionReason));
    }

    /** 신규 예약 알림 → 사장님 */
    @Async
    public void sendNewReservationAlertToOwner(String ownerEmail, String ownerName,
                                               String storeName, String memberName,
                                               String reservationDate, String reservationTime,
                                               int guestCount) {
        sendReservationStatusEmail(ownerEmail, "[RESERVE] 새로운 예약이 접수되었습니다",
                buildOwnerAlertContent(ownerName, storeName, memberName, reservationDate, reservationTime, guestCount));
    }

    private void sendReservationStatusEmail(String toEmail, String subject, String htmlContent) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(fromEmail, fromName);
            helper.setTo(toEmail);
            helper.setSubject(subject);
            helper.setText(htmlContent, true);
            mailSender.send(message);
            log.info("예약 알림 이메일 발송: {}", toEmail);
        } catch (MessagingException | UnsupportedEncodingException e) {
            log.error("예약 알림 이메일 발송 실패 ({}): {}", toEmail, e.getMessage());
        }
    }

    private String buildReservationStatusContent(String memberName, String storeName,
                                                  String reservationDate, String reservationTime,
                                                  int guestCount, String statusLabel, String statusColor,
                                                  String statusMessage, String rejectionReason) {
        String reasonRow = rejectionReason != null
                ? "<tr><td style=\"color:#8b95a1;padding:8px 0;\">거절 사유</td><td style=\"color:#191f28;font-weight:600;\">"
                  + rejectionReason + "</td></tr>"
                : "";
        return "<!DOCTYPE html><html><head><meta charset=\"UTF-8\">" + FONT_IMPORT + "</head>"
            + "<body style=\"margin:0;padding:0;font-family:" + FONT_FAMILY + ";background:#f9fafb;\">"
            + "<div style=\"width:100%;background:#f9fafb;padding:40px 0;\">"
            + "  <div style=\"max-width:500px;margin:0 auto;background:#fff;border-radius:24px;padding:48px 32px;box-shadow:0 4px 12px rgba(0,0,0,0.05);\">"
            + "    <div style=\"margin-bottom:24px;\"><span style=\"font-size:20px;font-weight:800;color:#3182f6;font-family:" + FONT_FAMILY + ";\">RESERVE</span></div>"
            + "    <div style=\"display:inline-block;background:" + statusColor + ";color:#fff;font-size:13px;font-weight:700;border-radius:20px;padding:4px 14px;margin-bottom:16px;\">" + statusLabel + "</div>"
            + "    <h1 style=\"font-size:22px;font-weight:700;color:#191f28;margin:0 0 8px;font-family:" + FONT_FAMILY + ";\">" + memberName + "님, " + statusMessage + "</h1>"
            + "    <p style=\"font-size:15px;color:#4e5968;margin:0 0 28px;\">" + statusMessage + "</p>"
            + "    <div style=\"background:#f2f4f6;border-radius:16px;padding:24px;margin-bottom:28px;\">"
            + "      <table style=\"width:100%;border-collapse:collapse;font-family:" + FONT_FAMILY + ";\">"
            + "        <tr><td style=\"color:#8b95a1;padding:8px 0;\">가게</td><td style=\"color:#191f28;font-weight:600;\">" + storeName + "</td></tr>"
            + "        <tr><td style=\"color:#8b95a1;padding:8px 0;\">날짜</td><td style=\"color:#191f28;font-weight:600;\">" + reservationDate + "</td></tr>"
            + "        <tr><td style=\"color:#8b95a1;padding:8px 0;\">시간</td><td style=\"color:#191f28;font-weight:600;\">" + reservationTime + "</td></tr>"
            + "        <tr><td style=\"color:#8b95a1;padding:8px 0;\">인원</td><td style=\"color:#191f28;font-weight:600;\">" + guestCount + "명</td></tr>"
            + reasonRow
            + "      </table>"
            + "    </div>"
            + "    <div style=\"font-size:13px;color:#b0b8c1;border-top:1px solid #f2f4f6;padding-top:20px;\">© 2026 RESERVE. All rights reserved.</div>"
            + "  </div>"
            + "</div></body></html>";
    }

    private String buildOwnerAlertContent(String ownerName, String storeName, String memberName,
                                           String reservationDate, String reservationTime, int guestCount) {
        return "<!DOCTYPE html><html><head><meta charset=\"UTF-8\">" + FONT_IMPORT + "</head>"
            + "<body style=\"margin:0;padding:0;font-family:" + FONT_FAMILY + ";background:#f9fafb;\">"
            + "<div style=\"width:100%;background:#f9fafb;padding:40px 0;\">"
            + "  <div style=\"max-width:500px;margin:0 auto;background:#fff;border-radius:24px;padding:48px 32px;box-shadow:0 4px 12px rgba(0,0,0,0.05);\">"
            + "    <div style=\"margin-bottom:24px;\"><span style=\"font-size:20px;font-weight:800;color:#3182f6;font-family:" + FONT_FAMILY + ";\">RESERVE</span></div>"
            + "    <div style=\"display:inline-block;background:#3182f6;color:#fff;font-size:13px;font-weight:700;border-radius:20px;padding:4px 14px;margin-bottom:16px;\">새 예약</div>"
            + "    <h1 style=\"font-size:22px;font-weight:700;color:#191f28;margin:0 0 8px;font-family:" + FONT_FAMILY + ";\">" + ownerName + "님, 새로운 예약이 들어왔어요!</h1>"
            + "    <p style=\"font-size:15px;color:#4e5968;margin:0 0 28px;\">" + storeName + "에 예약 요청이 접수되었습니다. 확인 후 승인해주세요.</p>"
            + "    <div style=\"background:#f2f4f6;border-radius:16px;padding:24px;margin-bottom:28px;\">"
            + "      <table style=\"width:100%;border-collapse:collapse;font-family:" + FONT_FAMILY + ";\">"
            + "        <tr><td style=\"color:#8b95a1;padding:8px 0;\">고객명</td><td style=\"color:#191f28;font-weight:600;\">" + memberName + "</td></tr>"
            + "        <tr><td style=\"color:#8b95a1;padding:8px 0;\">날짜</td><td style=\"color:#191f28;font-weight:600;\">" + reservationDate + "</td></tr>"
            + "        <tr><td style=\"color:#8b95a1;padding:8px 0;\">시간</td><td style=\"color:#191f28;font-weight:600;\">" + reservationTime + "</td></tr>"
            + "        <tr><td style=\"color:#8b95a1;padding:8px 0;\">인원</td><td style=\"color:#191f28;font-weight:600;\">" + guestCount + "명</td></tr>"
            + "      </table>"
            + "    </div>"
            + "    <div style=\"font-size:13px;color:#b0b8c1;border-top:1px solid #f2f4f6;padding-top:20px;\">© 2026 RESERVE. All rights reserved.</div>"
            + "  </div>"
            + "</div></body></html>";
    }

    @Async
    public void sendPasswordResetEmail(String toEmail, String code) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(fromEmail, fromName);
            helper.setTo(toEmail);
            helper.setSubject("[RESERVE] 비밀번호 재설정 코드");
            helper.setText(buildPasswordResetEmailContent(code), true);
            mailSender.send(message);
            log.info("비밀번호 재설정 이메일 발송 완료: {}", toEmail);
        } catch (MessagingException | UnsupportedEncodingException e) {
            log.error("비밀번호 재설정 이메일 발송 실패: {}", e.getMessage());
        }
    }

    private String buildPasswordResetEmailContent(String code) {
        return "<!DOCTYPE html><html><head><meta charset=\"UTF-8\">" + FONT_IMPORT + "</head>"
            + "<body style=\"margin:0;padding:0;font-family:" + FONT_FAMILY + ";background-color:#f9fafb;\">"
            + "  <div style=\"width:100%;background-color:#f9fafb;padding:40px 0;\">"
            + "    <div style=\"max-width:500px;margin:0 auto;background-color:#ffffff;border-radius:24px;padding:48px 32px;box-shadow:0 4px 12px rgba(0,0,0,0.05);\">"
            + "      <div style=\"margin-bottom:32px;\"><span style=\"font-size:20px;font-weight:800;color:#3182f6;letter-spacing:-0.5px;font-family:" + FONT_FAMILY + ";\">RESERVE</span></div>"
            + "      <h1 style=\"font-size:24px;font-weight:700;color:#191f28;line-height:1.4;margin:0 0 12px 0;font-family:" + FONT_FAMILY + ";\">비밀번호를<br/>재설정해주세요.</h1>"
            + "      <p style=\"font-size:16px;color:#4e5968;line-height:1.6;margin:0 0 32px 0;\">아래 인증 코드를 입력해 비밀번호를 재설정하세요.<br/>코드는 5분간 유효합니다.</p>"
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
        return "<!DOCTYPE html><html><head><meta charset=\"UTF-8\">" + FONT_IMPORT + "</head>"
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
            + "        본 메일은 회원가입을 위한 본인 확인 메일입니다.<br/>"
            + "        인증 코드는 <span style=\"color:#8b95a1;\">5분간</span> 유효합니다.<br/><br/>"
            + "        © 2026 RESERVE. All rights reserved."
            + "      </div>"
            + "    </div>"
            + "  </div>"
            + "</body></html>";
    }
}
