package kr.it.reserve.chat.service;

import kr.it.reserve.chat.dto.ChatReportRetentionResponse;
import kr.it.reserve.chat.dto.UpdateChatReportRetentionRequest;
import kr.it.reserve.chat.entity.ChatReport;
import kr.it.reserve.chat.entity.ChatReportAccessAudit;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.chat.repository.ChatReportAccessAuditRepository;
import kr.it.reserve.chat.repository.ChatReportRepository;
import kr.it.reserve.chat.repository.ChatRoomRepository;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

/** 증거 내용 대신 보존 분류와 변경 근거만 관리하는 별도 관리자 경계. */
@Service
@RequiredArgsConstructor
public class ChatReportRetentionService {
    private final ChatRoomRepository rooms;
    private final ChatReportRepository reports;
    private final ChatReportAccessAuditRepository audits;

    @Transactional(readOnly = true)
    public ChatReportRetentionResponse get(Member admin, Long reportId) {
        assertAdmin(admin);
        return ChatReportRetentionResponse.from(reports.findById(reportId).orElseThrow(this::notFound));
    }

    @Transactional
    public ChatReportRetentionResponse update(Member admin, Long reportId, UpdateChatReportRetentionRequest request) {
        assertAdmin(admin);
        LocalDateTime now = LocalDateTime.now(Clock.systemUTC());
        validate(request, now);
        Long roomId = reports.findRoomIdById(reportId).orElseThrow(this::notFound);
        rooms.findByIdForUpdate(roomId).orElseThrow(this::notFound);
        var report = reports.findByIdForUpdate(reportId).orElseThrow(this::notFound);
        if (!roomId.equals(report.getRoom().getId())) throw notFound();
        LocalDateTime basisAt = request.getCategory() == ChatReport.RetentionCategory.CONTRACT_PAYMENT
                && request.getRetentionBasisAt() != null
                ? request.getRetentionBasisAt().withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime() : null;
        report.changeRetention(request.getCategory(), request.getHold(), basisAt, request.getNote().trim(), admin.getId(), now);
        audits.save(new ChatReportAccessAudit(reportId, admin.getId(), null, ChatReportAccessAudit.Action.RETENTION_CHANGE));
        return ChatReportRetentionResponse.from(report);
    }

    private void validate(UpdateChatReportRetentionRequest request, LocalDateTime now) {
        if (request == null || request.getCategory() == null || request.getHold() == null
                || request.getNote() == null || request.getNote().isBlank() || request.getNote().length() > 500) {
            throw new ChatException("보존 분류·보류 여부·변경 근거를 확인해주세요.", HttpStatus.BAD_REQUEST);
        }
        if (request.getRetentionBasisAt() != null && request.getRetentionBasisAt()
                .withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime().isAfter(now)) {
            throw new ChatException("보존 기산일은 현재보다 이후일 수 없어요.", HttpStatus.BAD_REQUEST);
        }
        if (!request.getHold() && (request.getCategory() == ChatReport.RetentionCategory.UNCLASSIFIED
                || (request.getCategory() == ChatReport.RetentionCategory.CONTRACT_PAYMENT
                && request.getRetentionBasisAt() == null))) {
            throw new ChatException("보류를 해제하려면 분류와 계약·결제 증거의 실제 기산일을 확정해주세요.", HttpStatus.BAD_REQUEST);
        }
    }

    private void assertAdmin(Member member) {
        if (member == null || member.getId() == null || member.getRole() != Role.ADMIN)
            throw new ChatException("접근 권한이 없어요.", HttpStatus.FORBIDDEN);
    }

    private ChatException notFound() {
        return new ChatException("채팅 신고를 찾을 수 없어요.", HttpStatus.NOT_FOUND);
    }
}
