package kr.it.reserve.chat.service;

import kr.it.reserve.chat.dto.ChatReportResponse;
import kr.it.reserve.chat.dto.ChatReportContextResponse;
import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.dto.ConversationModerationStateResponse;
import kr.it.reserve.chat.dto.CreateChatReportRequest;
import kr.it.reserve.chat.dto.ReviewChatReportRequest;
import kr.it.reserve.chat.entity.ChatMessage;
import kr.it.reserve.chat.entity.ChatReport;
import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.entity.SenderRole;
import kr.it.reserve.chat.repository.ChatMessageRepository;
import kr.it.reserve.chat.repository.ChatReportRepository;
import kr.it.reserve.chat.repository.ChatRoomRepository;
import kr.it.reserve.chat.repository.ChatReportEvidenceRepository;
import kr.it.reserve.chat.entity.ChatReportEvidence;
import kr.it.reserve.chat.entity.ChatReportAccessAudit;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;

/** 가게 대화의 차단과 신고. 메시지 전송과 분리해 자동 제재로 이어지지 않게 한다. */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ChatModerationService {

    private static final int REPORT_PAGE_SIZE = 20;

    private final ChatRoomRepository roomRepository;
    private final ChatMessageRepository messageRepository;
    private final ChatReportRepository reportRepository;
    private final StoreRepository storeRepository;
    private final ChatReportEvidenceRepository evidenceRepository;
    private final ChatReportAuditService auditService;

    @Transactional
    public void setHidden(Member actor, Long roomId, String viewerRole, boolean hidden) {
        ChatRoom room = findRoomForUpdate(roomId);
        SenderRole role = participantRole(viewerRole);
        if (role == SenderRole.MEMBER && room.getMember().getId().equals(actor.getId())) {
            room.setHidden(role, hidden, actor.getId(), LocalDateTime.now(Clock.systemDefaultZone()));
        } else {
            assertStoreParticipant(room, actor, role);
            room.setHidden(role, hidden, actor.getId(), LocalDateTime.now(Clock.systemDefaultZone()));
        }
    }

    @Transactional
    public ConversationModerationStateResponse setBlocked(
            Member actor, Long roomId, String viewerRole, boolean blocked) {
        ChatRoom room = findRoomForUpdate(roomId);
        SenderRole role = participantRole(viewerRole);
        assertStoreParticipant(room, actor, role);
        room.setBlocked(role, blocked, LocalDateTime.now(Clock.systemDefaultZone()));
        log.info("Store conversation block changed: roomId={}, role={}, blocked={}", roomId, role, blocked);
        return ConversationModerationStateResponse.from(room, role);
    }

    @Transactional
    public ChatReportResponse createReport(
            Member reporter, Long roomId, String viewerRole, CreateChatReportRequest request) {
        ChatRoom room = findRoomForUpdate(roomId);
        SenderRole role = participantRole(viewerRole);
        assertStoreParticipant(room, reporter, role);

        ChatReport.Reason reason = request.getReason();
        if (reason == null) throw new ChatException("신고 사유를 선택해주세요.");
        String details = normalize(request.getDetails());
        if (reason == ChatReport.Reason.OTHER && details == null) {
            throw new ChatException("기타 신고 사유를 입력해주세요.");
        }

        Long messageId = request.getMessageId();
        if (messageId != null) assertReportableMessage(room, messageId, role);

        String reportKey = room.getId() + ":" + reporter.getId() + ":" + role + ":"
                + (messageId == null ? "conversation" : messageId);
        var existing = reportRepository.findByReportKey(reportKey);
        if (existing.isPresent()) return ChatReportResponse.from(existing.get());

        ChatReport report = reportRepository.save(ChatReport.builder()
                .room(room)
                .messageId(messageId)
                .reporterMemberId(reporter.getId())
                .reporterRole(role)
                .reason(reason)
                .details(details)
                .reportKey(reportKey)
                .evidenceCapturedAt(LocalDateTime.now(Clock.systemDefaultZone()))
                .build());
        List<ChatMessage> context = captureWindow(room.getId(), messageId);
        evidenceRepository.saveAll(context.stream().filter(item -> !item.isPurged())
                .map(item -> ChatReportEvidence.capture(report.getId(), item, LocalDateTime.now(Clock.systemDefaultZone()))).toList());
        log.info("Chat report created: reportId={}, roomId={}", report.getId(), roomId);
        return ChatReportResponse.from(report);
    }

    public Page<ChatReportResponse> listReports(ChatReport.Status status, int page) {
        PageRequest pageable = PageRequest.of(Math.max(0, page), REPORT_PAGE_SIZE);
        Page<ChatReport> reports = status == null
                ? reportRepository.findAllByOrderByCreatedAtDescIdDesc(pageable)
                : reportRepository.findByStatusOrderByCreatedAtDescIdDesc(status, pageable);
        return reports.map(ChatReportResponse::from);
    }

    /** 신고를 처리할 관리자가 최근 대화와 특정 신고 메시지를 읽는다. 읽음 수에는 손대지 않는다. */
    public ChatReportContextResponse reportContext(Member admin, Long reportId) {
        assertAdmin(admin);
        ChatReportContextResponse context = contextForImage(admin, reportId);
        auditService.recordAccess(admin, reportId, null, ChatReportAccessAudit.Action.CONTEXT);
        return context;
    }

    /** 사진 관문은 반환될 ID를 검증한 뒤 별도 IMAGE 감사만 기록한다. */
    public ChatReportContextResponse contextForImage(Member admin, Long reportId) {
        assertAdmin(admin);
        ChatReport report = reportRepository.findById(reportId)
                .orElseThrow(() -> new ChatException("신고를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
        Long roomId = report.getRoom().getId();
        List<ChatReportEvidence> evidence = evidenceRepository.findByReportIdOrderByMessageIdAsc(reportId);
        if (report.getEvidenceCapturedAt() != null) {
            List<ChatMessageResponse> captured = evidence.stream().map(ChatMessageResponse::forEvidence).toList();
            return ChatReportContextResponse.builder().report(ChatReportResponse.from(report))
                    .reportedMessage(captured.stream().filter(item -> item.getId().equals(report.getMessageId())).findFirst().orElse(null))
                    .recentMessages(captured).build();
        }
        List<ChatMessageResponse> recent = messageRepository.findByRoomIdOrderByIdDesc(
                        roomId, PageRequest.of(0, 50))
                .getContent().stream()
                .map(ChatMessageResponse::forReport)
                .toList()
                .reversed();
        ChatMessageResponse reportedMessage = report.getMessageId() == null ? null
                : messageRepository.findByIdAndRoomId(report.getMessageId(), roomId)
                .map(ChatMessageResponse::forReport)
                .orElse(null);
        return ChatReportContextResponse.builder()
                .report(ChatReportResponse.from(report))
                .reportedMessage(reportedMessage)
                .recentMessages(recent)
                .build();
    }

    @Transactional
    public ChatReportResponse reviewReport(Member admin, Long reportId, ReviewChatReportRequest request) {
        assertAdmin(admin);
        ChatReport report = reportRepository.findByIdForUpdate(reportId)
                .orElseThrow(() -> new ChatException("신고를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
        ChatReport.Status status = request.getStatus();
        if (status == null) throw new ChatException("처리 상태를 선택해주세요.");
        String note = normalize(request.getResolutionNote());
        if ((status == ChatReport.Status.RESOLVED || status == ChatReport.Status.DISMISSED) && note == null) {
            throw new ChatException("처리 완료 사유를 입력해주세요.");
        }
        report.review(status, note, admin.getId(), LocalDateTime.now(Clock.systemDefaultZone()));
        log.info("Chat report reviewed: reportId={}, status={}", reportId, status);
        return ChatReportResponse.from(report);
    }

    private ChatRoom findRoomForUpdate(Long roomId) {
        return roomRepository.findByIdForUpdate(roomId)
                .orElseThrow(() -> new ChatException("대화를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
    }

    private SenderRole participantRole(String viewerRole) {
        if ("MEMBER".equalsIgnoreCase(viewerRole)) return SenderRole.MEMBER;
        if ("OWNER".equalsIgnoreCase(viewerRole)) return SenderRole.OWNER;
        throw new ChatException("대화 참가자 역할이 올바르지 않습니다.");
    }

    private void assertStoreParticipant(ChatRoom room, Member actor, SenderRole role) {
        if (room.getType() != ChatRoom.RoomType.STORE) {
            throw new ChatException("가게 대화에서만 사용할 수 있습니다.", HttpStatus.FORBIDDEN);
        }
        if (role == SenderRole.MEMBER && room.getMember().getId().equals(actor.getId())) return;
        if (role == SenderRole.OWNER && ownsStore(room.getStoreId(), actor)) return;
        throw new ChatException("접근 권한이 없습니다.", HttpStatus.FORBIDDEN);
    }

    private boolean ownsStore(Long storeId, Member actor) {
        if (storeId == null || actor == null || !actor.isBusiness()) return false;
        return storeRepository.findById(storeId)
                .map(store -> store.getOwner() != null && store.getOwner().getId().equals(actor.getId()))
                .orElse(false);
    }

    private void assertReportableMessage(ChatRoom room, Long messageId, SenderRole reporterRole) {
        if (messageId <= 0) throw new ChatException("신고할 메시지가 올바르지 않습니다.");
        ChatMessage message = messageRepository.findByIdAndRoomId(messageId, room.getId())
                .orElseThrow(() -> new ChatException("신고할 메시지를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
        if (message.getSenderRole() == reporterRole) {
            throw new ChatException("상대방이 보낸 메시지만 신고할 수 있습니다.");
        }
        if (message.isPurged()) throw new ChatException("보존 기간이 지난 메시지입니다.", HttpStatus.GONE);
    }

    private List<ChatMessage> captureWindow(Long roomId, Long messageId) {
        if (messageId == null) return messageRepository.findByRoomIdOrderByIdDesc(roomId, PageRequest.of(0, 50)).getContent();
        List<ChatMessage> context = new java.util.ArrayList<>(messageRepository.findByRoomIdAndIdLessThanOrderByIdDesc(
                roomId, messageId, PageRequest.of(0, 10)).getContent());
        messageRepository.findByIdAndRoomId(messageId, roomId).ifPresent(context::add);
        context.addAll(messageRepository.findByRoomIdAndIdGreaterThanOrderByIdAsc(roomId, messageId, PageRequest.of(0, 10)).getContent());
        return context;
    }

    private void assertAdmin(Member admin) {
        if (admin == null || admin.getId() == null || admin.getRole() != Role.ADMIN)
            throw new ChatException("접근 권한이 없습니다.", HttpStatus.FORBIDDEN);
    }

    private String normalize(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
